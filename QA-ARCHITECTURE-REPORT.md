# QA Architecture Report — Hoard Lavish ERP System

## Senior QA Architect Assessment

**Date:** June 2025
**System:** Hoard Lavish ERP v1.0 — Multi-Store Clothing Brand Management
**Stack:** React 19 + TypeScript + Electron 33 + Supabase (PostgreSQL)
**Risk Profile:** HIGH — Financial transactions, multi-branch inventory, customer data

---

## Table of Contents

1. [Architecture Analysis & Weakness Identification](#1-architecture-analysis--weakness-identification)
2. [Business Logic Testing Strategy](#2-business-logic-testing-strategy)
3. [Frontend Component Testing](#3-frontend-component-testing)
4. [Backend / Supabase Service Testing](#4-backend--supabase-service-testing)
5. [End-to-End Test Strategy (Playwright)](#5-end-to-end-test-strategy-playwright)
6. [Performance Testing](#6-performance-testing)
7. [Electron-Specific Testing](#7-electron-specific-testing)
8. [Error Handling & Resilience Testing](#8-error-handling--resilience-testing)
9. [High-Risk ERP Failure Points](#9-high-risk-erp-failure-points)
10. [Test Matrix Summary](#10-test-matrix-summary)
11. [Recommendations & Remediation Priority](#11-recommendations--remediation-priority)

---

## 1. Architecture Analysis & Weakness Identification

### 1.1 System Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                   │
│  ┌─────────────────────────────────────────────┐ │
│  │              React 19 Frontend               │ │
│  │  ┌─────────────────────────────────────────┐ │ │
│  │  │          StoreContext (605 LOC)          │ │ │
│  │  │  ALL business logic + state management  │ │ │
│  │  └─────────────┬───────────────────────────┘ │ │
│  │                │ dbCall() wrapper            │ │
│  │  ┌─────────────▼───────────────────────────┐ │ │
│  │  │     supabaseService.ts (545 LOC)        │ │ │
│  │  │     Direct Supabase client calls        │ │ │
│  │  └─────────────┬───────────────────────────┘ │ │
│  └────────────────┼─────────────────────────────┘ │
│                   │ HTTPS                         │
└───────────────────┼─────────────────────────────┘
                    ▼
     ┌──────────────────────────────┐
     │     Supabase (PostgreSQL)    │
     │  • fn_complete_sale RPC      │
     │  • RLS (all policies = true) │
     │  • v_products_with_stock     │
     └──────────────────────────────┘
```

### 1.2 Critical Architecture Weaknesses

| # | Weakness | Severity | Impact | File(s) |
|---|----------|----------|--------|---------|
| W1 | **NO PRODUCT VARIANTS** — Single SKU per product. No size/color/variant model. | 🔴 CRITICAL | Cannot model clothing inventory (S/M/L/XL, colors). Fundamental gap for a clothing ERP. | `types.ts` |
| W2 | **NO SUPABASE AUTH** — PIN-based login with client-side comparison. PINs stored in plain text. | 🔴 CRITICAL | Anyone can read PINs from DB. No session tokens. No password hashing. RLS policies are all `USING (true)`. | `LoginPage.tsx`, `001_initial_schema.sql` |
| W3 | **NO ROLE-BASED ACCESS CONTROL** — All menu items visible to all roles. No server-side authorization. | 🔴 CRITICAL | Cashier can access Settings, Accounting, Branches. No server-side enforcement. | `Sidebar.tsx` |
| W4 | **TAX HARDCODED AT 8%** — POS calculates tax as `* 0.08` instead of `settings.taxRate`. | 🟡 HIGH | Tax miscalculation if store config differs. `completeSale()` uses `settings.taxRate` correctly, but POS display shows wrong preview. | `POS.tsx` L47 |
| W5 | **INVOICE COLLISION RISK** — `INV-${Date.now().toString().substr(-6)}` — only 6-digit timestamp suffix. | 🟡 HIGH | Two sales within same millisecond = duplicate invoice number. DB has UNIQUE constraint → second sale fails. | `StoreContext.tsx` L345 |
| W6 | **NO OFFLINE QUEUE** — No service worker. No pending operation queue. No offline detection. | 🟡 HIGH | Electron app with no internet → sales recorded locally but never synced. Next refresh loads from Supabase → data loss. | `StoreContext.tsx` |
| W7 | **NO RETURNS/REFUND MODULE** — Completely missing. | 🟡 HIGH | No way to process returns, exchanges, or credit notes. Must manual adjust stock + create negative expense. | N/A |
| W8 | **NO OPTIMISTIC UI ROLLBACK** — `dbCall()` catches errors but doesn't revert state. | 🟡 HIGH | DB failure = local state diverges from database. No reconciliation mechanism. | `StoreContext.tsx` L200 |
| W9 | **NO DOUBLE-SUBMIT PROTECTION** — Checkout buttons not disabled during async processing. | 🟡 HIGH | Rapid clicks → multiple `completeSale()` calls → duplicate sales + double stock deduction. | `POS.tsx` L69 |
| W10 | **NO CONCURRENT UPDATE PROTECTION** — No optimistic locking, no `SELECT FOR UPDATE`, no version columns. | 🟡 HIGH | Two cashiers selling last item simultaneously → both succeed locally → one fails at DB level → state mismatch. | `StoreContext.tsx` |
| W11 | **NO DB CHECK CONSTRAINTS ON STOCK** — `GREATEST(0, quantity - ...)` in RPC only, no column constraint. | 🟠 MEDIUM | Direct DB manipulation can set negative stock. Application-level `Math.max(0, ...)` is the only guard. | `001_initial_schema.sql` |
| W12 | **FLOATING POINT ARITHMETIC** — JavaScript `Number` for financial calculations. No decimal library. | 🟠 MEDIUM | `$33.33 × 3 = 99.99000000000001` — cumulative errors in totals over thousands of transactions. | `StoreContext.tsx`, `POS.tsx` |
| W13 | **NO INPUT VALIDATION LAYER** — No Zod/Yup schemas. Negative prices, empty names, duplicate SKUs all allowed. | 🟠 MEDIUM | Bad data enters system unchecked → financial reports corrupted. | All CRUD methods |
| W14 | **MONOLITHIC STATE CONTEXT** — All 25+ state variables and 30+ actions in single Context. | 🟠 MEDIUM | Any state change triggers re-render of entire component tree. Performance degrades with scale. | `StoreContext.tsx` |
| W15 | **NO STOCK TRANSFER** — No inter-branch transfer mechanism. Must manually adjust up/down in each branch. | 🟠 MEDIUM | Inventory transfers are common operation — audit trail broken. | N/A |

### 1.3 Dependency Risk Assessment

| Dependency | Version | Risk |
|-----------|---------|------|
| React | 19.2.4 | Low — stable release |
| Electron | 33.3.1 | Medium — needs regular security updates |
| supabase-js | 2.95.3 | Low |
| @google/genai | 1.41.0 | Low — optional feature |
| Vite | 6.2.0 | Low |
| TypeScript | 5.8.2 | Low |

**27 npm audit vulnerabilities** (2 moderate, 25 high) — **pre-existing, not from test deps**.

---

## 2. Business Logic Testing Strategy

### Test File: `tests/unit/business-logic.test.ts`

**Coverage Areas:**

| Test Group | # Tests | Priority |
|-----------|---------|----------|
| Multi-Store Stock Isolation | 4 | 🔴 CRITICAL |
| Stock Adjustment Logic | 6 | 🔴 CRITICAL |
| Cart Operations | 6 | 🟡 HIGH |
| Sale Completion | 6 | 🔴 CRITICAL |
| Financial Calculation Correctness | 7 | 🔴 CRITICAL |
| Invoice Generation | 3 | 🟡 HIGH |
| Product CRUD | 4 | 🟠 MEDIUM |
| User Auth & Roles | 4 | 🟡 HIGH |
| Branch Management | 2 | 🟠 MEDIUM |
| Import / Export | 4 | 🟠 MEDIUM |

**Key Assertions:**
- Stock in Branch A changes do NOT affect Branch B
- `Math.max(0, ...)` prevents negative stock
- `completeSale()` deducts correct amounts from correct branch
- Tax uses `settings.taxRate` (documents POS hardcode bug)
- Invoice numbers are unique per sale
- Cart quantity cannot exceed branch stock
- Customer loyalty points accumulate correctly
- Export → Import roundtrip preserves all data

---

## 3. Frontend Component Testing

### Test Files:
- `tests/components/LoginPage.test.tsx` — 11 tests
- `tests/components/POS.test.tsx` — 19 tests
- `tests/components/Inventory.test.tsx` — 9 tests
- `tests/components/Sidebar.test.tsx` — 8 tests

**Coverage Matrix:**

| Component | Rendering | Interaction | Validation | Bug Detection |
|-----------|-----------|-------------|------------|---------------|
| LoginPage | ✅ Role/user layout | ✅ PIN flow | ✅ Incorrect PIN | ✅ PIN limit |
| POS | ✅ Product grid, cart | ✅ Checkout, barcode | ✅ Empty cart disabled | ✅ Hardcoded tax, no double-submit |
| Inventory | ✅ Product table | ✅ Search, tabs | ✅ Stock adjust modal | — |
| Sidebar | ✅ Nav items | ✅ Click navigation | — | ✅ No RBAC filtering |

---

## 4. Backend / Supabase Service Testing

### Test File: `tests/services/supabaseService.test.ts`

**Approach:** Full mock of Supabase client. Tests query construction, field mapping, and error propagation.

| Function Group | # Tests | Focus |
|---------------|---------|-------|
| Branches (fetch/insert/update) | 4 | Correct table/fields |
| Products (CRUD + stock) | 4 | View usage, branch stock upserts |
| Customers | 1 | snake_case → camelCase mapping |
| Sales RPC | 2 | `fn_complete_sale` params, error handling |
| Error Handling | 2 | Throw on Supabase error, empty data |
| Stock Operations | 2 | Upsert with onConflict |
| Settings | 2 | Fetch/update field mapping |

**Critical Findings:**
- `updateProduct()` iterates branch stock entries sequentially (not batched)
- `completeSaleRPC()` sends full cart as JSON array — no size limit validation
- All service functions throw raw Supabase errors — no custom error classes

---

## 5. End-to-End Test Strategy (Playwright)

### Test File: `tests/e2e/enterprise-flows.spec.ts`
### Config: `playwright.config.ts`

**15 Enterprise Flows:**

| Flow | Description | Covers |
|------|-------------|--------|
| 1 | Authentication | Login, wrong PIN, role filter |
| 2 | POS Cash Sale | Product → Cart → Cash → Invoice |
| 3 | POS Card Sale + Customer | Customer select → Card → Invoice w/ customer |
| 4 | Barcode Scanner | SKU scan → Cart → Checkout |
| 5 | Stock Adjustment | Inventory → Adjust IN/OUT |
| 6 | Add Product | Inventory → Add Product modal |
| 7 | Sales History | Sale → View in history |
| 8 | Branch Switching | Change branch → Verify context |
| 9 | Customer Management | View/manage customers |
| 10 | Supplier Management | View suppliers |
| 11 | Accounting Dashboard | Financial overview loads |
| 12 | Settings | Config page loads |
| 13 | Backup & Restore | Export/import data |
| 14 | Multi-Branch Stock Isolation | Sell in A → Verify B unchanged |
| 15 | Logout & Re-Login | Full session lifecycle |

**Config Highlights:**
- Single worker (sequential) — ERP state matters
- 60s timeout per test
- Video/screenshot on failure
- Targets both Chromium and Electron viewport (1280×800)

---

## 6. Performance Testing

### Test File: `tests/performance/load.test.ts`

| Scenario | Scale | Pass Criteria |
|----------|-------|---------------|
| Large product catalog | 500–1000 products | < 5s insertion, no crash |
| Product search/filter | 500 products | < 100ms filter |
| High-volume sales | 100 consecutive sales | < 10s total, all succeed |
| Sales history growth | 100 records | Linear growth, no memory blow-up |
| Customer management | 500 customers | No crash |
| Export/import large data | 500 products | Valid JSON, size < 5MB |
| Stock history growth | 50 adjustments | Append-only, no dedup |
| Financial precision | 50 × $33.33 | Acceptable FP drift |

**Performance Risks Identified:**
- **Monolithic StoreContext** — Every state change re-renders all consumers (all components)
- **No pagination** — Product grid, sales history, stock history all load fully into memory
- **localStorage limit** — ~5MB cap; 1000 products with sales history could exceed this
- **`exportData()` serializes EVERYTHING** — exponential size growth

---

## 7. Electron-Specific Testing

### Test File: `tests/electron/offline-error.test.ts`

| Scenario | Status |
|----------|--------|
| localStorage persistence | ✅ Tested |
| Corrupt localStorage recovery | ✅ Tested |
| Export/import crash recovery | ✅ Tested |
| Platform detection via preload | ✅ Tested |
| Browser mode (no electronAPI) | ✅ Tested |
| No IPC handlers documented | ✅ Documented |

**Major Electron Gaps:**
- **No IPC communication** — `main.cjs` has no `ipcMain.handle()` calls
- **No native print** — Uses `window.print()` instead of Electron's print API
- **No file dialog** — Export uses browser download, not native save dialog
- **No auto-update** — No electron-updater configured
- **No system tray** — No background operation capability
- **No crash reporting** — No Sentry, Crashpad, or error reporting
- **No deep linking** — No protocol handler for `hoardlavish://`

---

## 8. Error Handling & Resilience Testing

### Tested Scenarios:

| Category | Scenario | Current Behavior | Risk |
|----------|----------|-----------------|------|
| DB Failure | Supabase offline | Local operations succeed, DB ops silently fail | 🔴 Data loss on next refresh |
| Network | Connection lost mid-sale | Sale completes locally, DB call fails | 🔴 Unsynced sale |
| Input | Negative price | Accepted without validation | 🟡 Financial corruption |
| Input | Empty product name | Accepted without validation | 🟠 Data quality |
| Input | Duplicate SKU | Accepted (DB may reject) | 🟡 Barcode scanner confusion |
| Input | Discount > subtotal | Negative tax calculated | 🟡 Financial loss |
| Concurrency | Same-ms invoice | Collision — DB UNIQUE constraint fails | 🔴 Sale failure |
| Concurrency | Double-click checkout | Two sales from one cart | 🔴 Duplicate charges |
| State | Optimistic update + DB error | State diverges from DB | 🔴 Data inconsistency |

---

## 9. High-Risk ERP Failure Points

### TIER 1 — Financial Liability Risk

| # | Failure Point | Description | Likelihood | Impact | CVSS-like Score |
|---|--------------|-------------|------------|--------|-----------------|
| F1 | **Double Sale Submission** | Rapid clicks on checkout → duplicate `completeSale()` | HIGH | Revenue recorded 2x, stock deducted 2x | **9.5** |
| F2 | **State-DB Divergence** | Any Supabase failure → local shows sale as complete → DB has no record | HIGH | Lost revenue, phantom sales, wrong inventory | **9.0** |
| F3 | **No Auth/Authorization** | PIN stored in plaintext, RLS policies allow all, no RBAC | HIGH | Any user can access admin features, data exposure | **9.0** |
| F4 | **Invoice Collision** | Two sales in same ms → same invoice number → DB constraint violation | MEDIUM | Second sale fails silently (UI shows success) | **8.5** |
| F5 | **Negative Total Allowed** | Discount > subtotal → negative tax + negative/zero total | MEDIUM | Customer pays nothing/gets money from store | **8.0** |

### TIER 2 — Operational Risk

| # | Failure Point | Description | Likelihood | Impact |
|---|--------------|-------------|------------|--------|
| F6 | **No Product Variants** | Cannot track S/M/L/XL independently | HIGH | Over-selling specific sizes |
| F7 | **Tax Mismatch** | POS shows 8% hardcoded, `completeSale` uses `settings.taxRate` | MEDIUM | Customer sees wrong amount on screen |
| F8 | **No Offline Queue** | Offline → operations succeed locally → lost on reconnect refresh | MEDIUM | Multi-hour offline shift = all data lost |
| F9 | **FP Arithmetic** | `$33.33 × 3` = `99.99000000000001` | LOW → cumulative | Sub-cent errors over thousands of txns |
| F10 | **localStorage Overflow** | High-volume store > 5MB data | MEDIUM | App crashes / data corrupt |

### TIER 3 — Data Integrity Risk  

| # | Failure Point | Description |
|---|--------------|-------------|
| F11 | No stock transfer audit trail |
| F12 | No data validation layer (Zod/Yup) |
| F13 | No foreign key cascades for deletions |
| F14 | Monolithic context performance degradation |
| F15 | No pagination on lists (memory pressure) |

---

## 10. Test Matrix Summary

### Test Distribution

| Test Category | File | # Tests | Framework |
|--------------|------|---------|-----------|
| Business Logic Unit Tests | `tests/unit/business-logic.test.ts` | 46 | Vitest |
| LoginPage Component | `tests/components/LoginPage.test.tsx` | 11 | Vitest + RTL |
| POS Component | `tests/components/POS.test.tsx` | 19 | Vitest + RTL |
| Inventory Component | `tests/components/Inventory.test.tsx` | 9 | Vitest + RTL |
| Sidebar Component | `tests/components/Sidebar.test.tsx` | 8 | Vitest + RTL |
| Supabase Service | `tests/services/supabaseService.test.ts` | 17 | Vitest |
| E2E Enterprise Flows | `tests/e2e/enterprise-flows.spec.ts` | 15 | Playwright |
| Performance / Load | `tests/performance/load.test.ts` | 11 | Vitest |
| Electron / Error Handling | `tests/electron/offline-error.test.ts` | 15 | Vitest |
| **TOTAL** | | **151** | |

### Infrastructure Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration (jsdom, setup, coverage) |
| `playwright.config.ts` | Playwright E2E configuration |
| `tests/setup.ts` | Global test setup (mocks for localStorage, DOM) |
| `tests/mocks/supabaseService.mock.ts` | Complete supabaseService mock |
| `tests/fixtures/data.ts` | Reusable test data fixtures |

### Running Tests

```bash
# Unit + Component + Performance + Error tests (Vitest)
npx vitest run

# With coverage report
npx vitest run --coverage

# Watch mode
npx vitest

# E2E tests (Playwright — requires dev server)
npx playwright test

# E2E with UI
npx playwright test --ui
```

---

## 11. Recommendations & Remediation Priority

### IMMEDIATE (Before Production)

| Priority | Action | Effort | Files Affected |
|----------|--------|--------|----------------|
| P0 | **Add double-submit protection** — disable checkout buttons during processing + loading state | 1 hour | `POS.tsx` |
| P0 | **Fix tax hardcode** — replace `* 0.08` with `settings.taxRate` in POS display | 5 min | `POS.tsx` L47 |
| P0 | **Fix invoice generation** — use UUID or `branch-timestamp-counter` pattern | 30 min | `StoreContext.tsx` |
| P0 | **Add discount validation** — cap at subtotal amount | 15 min | `StoreContext.tsx`, `POS.tsx` |
| P1 | **Implement role-based menu filtering** — hide Settings/Accounting from cashiers | 2 hours | `Sidebar.tsx` |
| P1 | **Add input validation layer** — Zod schemas for all entity creation | 4 hours | New validator files |
| P1 | **Implement optimistic rollback** — revert state on `dbCall()` failure | 6 hours | `StoreContext.tsx` |

### SHORT-TERM (Sprint 1-2)

| Priority | Action | Effort |
|----------|--------|--------|
| P2 | Replace PIN auth with Supabase Auth + bcrypt | 1-2 days |
| P2 | Implement proper RLS policies per user role | 1 day |
| P2 | Add offline queue (IndexedDB + sync worker) | 2-3 days |
| P2 | Add product variants (size/color/SKU-per-variant) | 3-5 days |
| P2 | Add returns/refund module | 2-3 days |
| P3 | Add inter-branch stock transfer with audit trail | 1-2 days |
| P3 | Add decimal.js for financial calculations | 1 day |

### MEDIUM-TERM (Month 1-2)

| Priority | Action | Effort |
|----------|--------|--------|
| P3 | Split StoreContext into domain-specific contexts | 2-3 days |
| P3 | Add pagination to all list views | 2 days |
| P3 | Implement Electron IPC for native print/file dialogs | 1-2 days |
| P3 | Add crash reporting (Sentry) | 4 hours |
| P4 | Add auto-updater for Electron | 1 day |
| P4 | Add E2E Electron testing with Spectron/Playwright | 2 days |

---

## Conclusion

The Hoard Lavish ERP has a clean, well-organized codebase with good TypeScript coverage and an atomic sale RPC. However, **it is NOT production-ready for financial operations** due to:

1. **Zero authentication security** (plaintext PINs, open RLS)
2. **No concurrency protection** (double-submit, race conditions)
3. **No offline resilience** (data loss on network failure)
4. **No input validation** (negative prices, duplicate SKUs)
5. **Missing core clothing ERP features** (variants, returns)

The test suite created in this assessment provides **151 tests** covering business logic, components, services, E2E flows, performance, and error handling. The tests actively document 15+ bugs and architectural weaknesses to guide remediation.

**Risk Rating: HIGH — Not suitable for production without P0/P1 fixes.**

---

*Generated by Senior QA Architect Assessment — Hoard Lavish ERP v1.0*
