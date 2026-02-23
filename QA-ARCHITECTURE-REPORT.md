# HOARD LAVISH ERP — Senior QA Architecture Report

**System:** Hoard Lavish Clothing Brand ERP
**Stack:** React 19 + TypeScript 5.8 + Vite 6 + Electron 33 + Supabase
**Test Branch:** `test` — 151 tests, 8 test files, **100% pass rate**
**Report Date:** February 2026

---

## Table of Contents

1. [STEP 1: Test Architecture Overview](#step-1-test-architecture-overview)
2. [STEP 2: Frontend Testing Process](#step-2-frontend-testing-process)
3. [STEP 3: Backend / Supabase Testing](#step-3-backend--supabase-testing)
4. [STEP 4: Playwright E2E Testing](#step-4-playwright-e2e-testing)
5. [STEP 5: Test Execution Process](#step-5-test-execution-process)
6. [STEP 6: Test Coverage Analysis](#step-6-test-coverage-analysis)
7. [STEP 7: Development Workflow for Tests](#step-7-development-workflow-for-tests)

---

## STEP 1: Test Architecture Overview

### 1.1 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Test Runner** | Vitest | 4.0.18 | Fast, Vite-native test execution with ESM support |
| **DOM Environment** | happy-dom | (bundled) | Lightweight browser simulation — chosen over jsdom due to ESM compatibility issues |
| **Component Testing** | @testing-library/react | 16.3.2 | React component rendering and interaction |
| **DOM Assertions** | @testing-library/jest-dom | 6.9.1 | Semantic DOM matchers (`.toBeInTheDocument()`, `.toBeDisabled()`, etc.) |
| **User Simulation** | @testing-library/user-event | 14.6.1 | High-fidelity user interaction simulation |
| **E2E Testing** | @playwright/test | 1.58.2 | Cross-browser end-to-end testing |
| **Coverage** | V8 (built into Vitest) | — | Native coverage via V8's code instrumentation |

### 1.2 Test Directory Structure

```
tests/
├── setup.ts                              # Global setup: mocks, cleanup, env overrides
├── mocks/
│   └── supabaseService.mock.ts           # Full vi.fn() stubs for all 35+ service exports
├── fixtures/
│   └── data.ts                           # Reusable test data: branches, products, users, etc.
├── components/
│   ├── LoginPage.test.tsx                # 15 tests — 3-step PIN login flow
│   ├── POS.test.tsx                      # 26 tests — Product grid, cart, checkout, customers
│   ├── Inventory.test.tsx                # 9 tests  — Product list, tabs, CRUD, stock adjustment
│   └── Sidebar.test.tsx                  # 7 tests  — Navigation, role-based filtering, branch
├── services/
│   └── supabaseService.test.ts           # 17 tests — All Supabase CRUD + error handling
├── unit/
│   └── business-logic.test.ts            # 46 tests — Stock isolation, cart, sales, invoices, import/export
├── performance/
│   └── load.test.ts                      # 12 tests — Large catalogs, high-volume sales, memory
├── electron/
│   └── offline-error.test.ts             # 19 tests — Offline persistence, API failures, input validation
└── e2e/
    └── enterprise-flows.spec.ts          # 15 Playwright specs — Full login-to-sale E2E flows
```

### 1.3 Test Distribution by Category

| Category | File | Tests | What It Validates |
|----------|------|-------|-------------------|
| **Component** | LoginPage.test.tsx | 15 | UI rendering, 3-step login flow, PIN pad, auth |
| **Component** | POS.test.tsx | 26 | Product grid, search, barcode, cart, checkout, invoices |
| **Component** | Inventory.test.tsx | 9 | Product table, search, tabs, CRUD modal, stock adjustment |
| **Component** | Sidebar.test.tsx | 7 | Nav items, role-based visibility, branch selector |
| **Service** | supabaseService.test.ts | 17 | DB query construction, error handling, data mapping |
| **Unit** | business-logic.test.ts | 46 | Core store logic — stock, cart, sales, invoices, users |
| **Performance** | load.test.ts | 12 | 500–1000 product catalogs, 100 rapid sales, memory |
| **Resilience** | offline-error.test.ts | 19 | localStorage, offline, API failures, input validation |
| **E2E** | enterprise-flows.spec.ts | 15 | Full user journeys in real browser (Playwright) |
| | **TOTAL** | **151 + 15 E2E** | |

### 1.4 Architectural Decisions & Rationale

1. **happy-dom over jsdom**: The standard jsdom environment caused ESM module resolution errors with React 19 and Vite 6. happy-dom is lighter, faster, and fully compatible with Vite's ESM pipeline.

2. **Full Supabase Service Mock**: Rather than mocking individual endpoints per-test, a centralized mock file (`tests/mocks/supabaseService.mock.ts`) replaces *all* 35+ service exports with `vi.fn()` stubs. This ensures zero database calls during unit/component tests while maintaining a single source of truth for mock behavior.

3. **`import.meta.env` Override**: The setup file sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to empty strings. This forces `isSupabaseConfigured()` to return `false`, ensuring the app falls back to localStorage-only mode during tests. Without this, real `.env` credentials would activate database code paths that receive mocked empty responses, causing false test failures.

4. **`localStorage.clear()` After Each Test**: The `StoreContext` reads from localStorage on initialization (persistence feature). Without clearing between tests, state accumulates across test runs, causing non-deterministic failures.

---

## STEP 2: Frontend Testing Process

### 2.1 Component Test Architecture

Every component test follows the same pattern:

```typescript
// 1. Mock Supabase so no real DB calls occur
vi.mock('../../services/supabaseService', () => import('../mocks/supabaseService.mock'));

// 2. Auto-login wrapper (most components require authentication)
function AutoLoginComponent() {
  const { login, users } = useStore();
  React.useEffect(() => {
    const admin = users.find(u => u.role === 'ADMIN');
    if (admin) login(admin);
  }, []);
  return <ComponentUnderTest />;
}

// 3. Render inside StoreProvider (the app's global context)
function renderComponent() {
  return render(
    <StoreProvider>
      <AutoLoginComponent />
    </StoreProvider>
  );
}
```

**Why Auto-Login?** The application gates all views behind authentication. Without programmatically logging in as an admin user, components render nothing or redirect to the login page. The auto-login wrapper simulates an authenticated session using the hardcoded initial users from `constants.ts`.

### 2.2 LoginPage Tests (15 tests)

The LoginPage implements a 3-step authentication flow: **Role → User → PIN**.

**What's tested:**
- **Rendering**: Hoard Lavish branding, all 3 role buttons, "Choose a role first" prompt
- **Role Selection**: Clicking "Admin" filters users to admin-only; clicking "Cashier" filters to cashier-only; switching roles clears selected user and PIN
- **User Selection**: Selecting a user reveals the PIN pad with digits 0–9, CLR, and backspace (⌫)
- **PIN Entry**: Unlock button disabled until 4 digits entered; CLR resets; backspace removes last digit; PIN capped at 4 digits
- **Authentication**: Incorrect PIN (9999) shows "Incorrect PIN" error; correct PIN (1234) authenticates without error
- **Security Edge Case**: Unlock button not rendered until user selected

**Key Pattern — `act()` + `fireEvent.click()`**: Each click on the PIN pad triggers React 18's batched state updates. Wrapping every `fireEvent.click()` in its own `act()` ensures state flushes between interactions:

```typescript
async function enterPin(digits: string[]) {
  for (const d of digits) {
    await act(async () => { fireEvent.click(screen.getByText(d)); });
  }
}
```

### 2.3 POS (Point of Sale) Tests (26 tests)

The most complex component: product grid, barcode scanner, cart management, checkout flow, and invoice generation.

**Product Grid (7 tests):**
- Products render with names, prices (LKR locale format), SKUs, and stock badges
- Category filter buttons work — clicking "Clothing" hides "Footwear" products
- Out-of-stock products display "Out of Stock" badge

**Search & Barcode (3 tests):**
- Text search input (placeholder: "Search products... (Enter to add)") filters products by name in real-time
- Barcode/SKU input (`DRS-001`) adds product to cart on Enter
- Unknown barcode leaves cart empty

**Cart Operations (3 tests):**
- Clicking a product card adds it to cart (helper finds closest `cursor-pointer` or `rounded-xl` ancestor)
- Cart footer shows Subtotal, Discount, and Total (tax has been removed from POS billing)
- Discount input adjusts total downward

**Checkout Flow (6 tests):**
- Cash/Card buttons disabled when cart empty, enabled when items present
- Both Cash and Card checkout open the invoice modal ("Payment Successful")
- Invoice modal shows invoice number, store name, product details
- "Done" button closes modal and clears cart

**Customer Selection (5 tests):**
- Customer search input rendered with placeholder "Search customer by name or phone..."
- "Add New Customer" button opens modal with name/phone/email fields
- Creating a customer adds them to the interface
- Current branch name displayed
- Print Receipt calls `window.print()`

**Bug Detection (2 tests):**
- Tax has been removed from POS — validates no "Tax" label present, total = subtotal − discount
- No double-submit protection documented (checkout button not disabled during processing)

### 2.4 Inventory Tests (9 tests)

- Product table renders all products with SKU, category, and price columns (LKR format)
- Search input filters products by name
- 4-tab navigation: All Products, Low Stock Alerts, Stock History, Categories & Brands
- Stock History tab shows "No stock movement history" initially
- "Add Product" button opens modal with "Save Product" action
- Stock adjustment modal opens from per-product adjust buttons

### 2.5 Sidebar Tests (7 tests)

- All 9 navigation items render for Admin role
- Brand "HOARD LAVISH" displayed
- Current branch name and logged-in user info shown
- **Role-based filtering verified**: Cashier does NOT see Settings, Accounting, Branch Mgmt, or Suppliers — only core items like POS and Inventory
- Logout button rendered
- Branch dropdown shows all branches

---

## STEP 3: Backend / Supabase Testing

### 3.1 Service Layer Test Design

The `tests/services/supabaseService.test.ts` file (17 tests) validates the data access layer by mocking the Supabase client itself rather than the service functions.

**Mock Strategy — Chainable Query Builder:**

```typescript
function createChain() {
  const chain: any = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  chain.then = (resolve) => resolve({ data: [], error: null });
  return chain;
}

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => mockChain),
    rpc: vi.fn(() => Promise.resolve({ data: 'sale-id', error: null })),
  }
}));
```

This recreates Supabase's fluent query API (`supabase.from('table').select('*').eq('id', 'x')`), allowing tests to verify:
- **Correct table names** — `supabase.from('branches')`, `supabase.from('v_products_with_stock')`
- **Query method chains** — `select('*')`, `order(...)`, `eq('id', value)`
- **Payload correctness** — `insert()` and `update()` receive properly mapped fields

### 3.2 Tested Operations

| Domain | Operations Tested |
|--------|------------------|
| **Branches** | `fetchBranches` (select + order), `insertBranch` (insert + single), `updateBranch` (update + eq) |
| **Products** | `fetchProductsWithStock` (reads view), `insertProduct` (products + branch_stock), `updateProduct` (with branchStock upsert), `deleteProduct` |
| **Customers** | `fetchCustomers` (snake_case → camelCase mapping: `loyalty_points` → `loyaltyPoints`) |
| **Sales RPC** | `completeSaleRPC` calls `fn_complete_sale` with correctly mapped parameters |
| **Stock** | `upsertBranchStock` (with onConflict), `insertStockMovement` (snake_case mapping) |
| **Settings** | `fetchSettings` (single row), `updateSettings` (select existing → update) |

### 3.3 Error Handling Tests

- **All fetch functions throw on Supabase error**: When `error: { message: 'DB down' }` is returned, the service rejects the promise
- **Null data without error returns empty array**: Graceful degradation
- **RPC error propagation**: `completeSaleRPC` throws when RPC returns `error: { message: 'Invoice duplicate' }`

### 3.4 Data Mapping Validation

The service layer transforms Supabase's snake_case responses to the app's camelCase TypeScript interfaces:

```
DB: { loyalty_points: 100, total_spent: '5000.00' }
→ App: { loyaltyPoints: 100, totalSpent: 5000 }

DB: { price: '1250.00', cost_price: '600.00', branch_stock: {...} }
→ App: { price: 1250, costPrice: 600, branchStock: {...} }
```

Tests verify these transformations produce correct numeric types (not strings).

---

## STEP 4: Playwright E2E Testing

### 4.1 Configuration

Defined in `playwright.config.ts`:

| Setting | Value | Rationale |
|---------|-------|-----------|
| `fullyParallel` | `false` | ERP operations share state; sequential execution prevents conflicts |
| `workers` | `1` | Single worker avoids localStorage race conditions |
| `timeout` | `60,000ms` | ERP operations (sales, inventory) can be slow on test machines |
| `expect.timeout` | `10,000ms` | DOM assertions need time for React state updates |
| `retries` | `2` (CI only) | Flaky retries only in CI, zero locally for fast feedback |
| `trace` | `on-first-retry` | Capture trace only when a test fails — minimal overhead |
| `screenshot` | `only-on-failure` | Automated failure evidence |
| `video` | `retain-on-failure` | Full video replay for debugging failed flows |

**Two Browser Projects:**
1. **chromium** — Standard desktop Chrome
2. **electron-viewport** — 1280×800 viewport with Electron user agent string, simulating the desktop app window

**Automatic Dev Server:** `webServer` config starts `npm run dev` on port 3000 before tests, with 30s startup timeout.

### 4.2 Test Flows (15 Specifications)

| Flow | Description | Key Actions |
|------|-------------|-------------|
| 1 | **Authentication** | Admin login with correct PIN; incorrect PIN shows error; role filter shows matching users |
| 2 | **POS Cash Sale** | Login → POS → Click product → Cart populated → Cash checkout → Invoice → Done → Cart cleared |
| 3 | **POS Card Sale with Customer** | Select customer → Add product → Card checkout → Invoice shows customer |
| 4 | **Barcode Scanner** | Type SKU `DRS-001` → Enter → Product in cart → Checkout |
| 5 | **Stock Adjustment** | Navigate to Inventory → Verify product visible |
| 6 | **Add Product** | Inventory → "Add Product" → Modal opens |
| 7 | **Sales History** | Make sale → Navigate to Sales History → Invoice # visible |
| 8 | **Branch Switching** | Verify "Main HQ Store" displayed |
| 9 | **Customer Management** | Navigate to Customers → Verify customer names |
| 10 | **Supplier Management** | Navigate to Suppliers → Verify list renders |
| 11 | **Accounting** | Navigate to Accounting → Page visible |
| 12 | **Settings** | Navigate to Settings → Config options visible |
| 13 | **Backup & Restore** | Settings → Backup tab |
| 14 | **Multi-Branch Stock Isolation** | Sell product → Verify stock decreased → Switch branch |
| 15 | **Logout & Re-Login** | Logout → Confirm → Login page shown |

### 4.3 E2E Helper Functions

```typescript
async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('button:has-text("Admin")');
  await page.click('button:has-text("Ahmed Admin")');
  await page.click('button:has-text("1")');  // PIN: 1234
  await page.click('button:has-text("2")');
  await page.click('button:has-text("3")');
  await page.click('button:has-text("4")');
  await page.waitForSelector('text=Dashboard', { timeout: 10_000 });
}
```

### 4.4 E2E vs Unit Test Boundary

E2E tests run against the **real app in a real browser** — they verify the full stack including component rendering, CSS, routing, and user interactions. Unit/component tests verify **logic in isolation** with mocked dependencies. Both are necessary:

- **Unit tests catch**: calculation errors, state management bugs, data mapping issues
- **E2E tests catch**: broken CSS layouts, navigation flow issues, real browser event handling

---

## STEP 5: Test Execution Process

### 5.1 Available Commands

| Command | Script | Purpose |
|---------|--------|---------|
| `npm test` | `vitest run` | Single run of all unit/component tests (CI mode) |
| `npm run test:watch` | `vitest` | Watch mode with hot-reload (development) |
| `npm run test:coverage` | `vitest run --coverage` | Run tests + generate V8 coverage report |
| `npm run test:e2e` | `playwright test` | Run all Playwright E2E specs |
| `npm run test:e2e:ui` | `playwright test --ui` | Interactive Playwright UI for debugging |

### 5.2 Test Lifecycle per Test

```
1. vitest.config.ts     → Set happy-dom environment, globals, 15s timeout
2. tests/setup.ts       → Register jest-dom matchers
3. [Test file imports]  → vi.mock() replaces supabaseService
4. [Test runs]          → Component renders inside StoreProvider
5. afterEach()          → cleanup() + localStorage.clear() + mock.mockClear()
6. [Next test]          → Fresh state, no accumulated side effects
```

### 5.3 Global Setup Details (`tests/setup.ts`)

The setup file performs 6 critical operations:

1. **Import jest-dom matchers** — Adds `.toBeInTheDocument()`, `.toBeDisabled()`, etc.
2. **After-each cleanup** — React testing cleanup + localStorage clear + mock call-count reset
3. **Env override** — Disables Supabase by setting empty `VITE_SUPABASE_URL`
4. **Window API mocks** — `alert`, `confirm`, `print` are `vi.fn()` stubs (allows `toHaveBeenCalled()` assertions)
5. **localStorage mock** — Full implementation with `getItem`/`setItem`/`clear` as `vi.fn()` wrappers over a simple key-value store
6. **Browser API stubs** — `matchMedia` and `ResizeObserver` return inert objects (prevents "not defined" errors in happy-dom)

### 5.4 Test Data Pipeline

Tests use data from two sources:

1. **`constants.ts`** — The app's `INITIAL_PRODUCTS`, `INITIAL_BRANCHES`, `INITIAL_USERS`, `INITIAL_CUSTOMERS`, and `INITIAL_SETTINGS` are loaded by `StoreContext` on initialization. These provide the base state for all tests.

2. **`tests/fixtures/data.ts`** — Typed test fixtures (`productGown`, `branchHQ`, `userAdmin`, `makeSale()`) that mirror the initial data for assertions. This separation allows tests to assert against known values without coupling to the constants file.

---

## STEP 6: Test Coverage Analysis

### 6.1 Coverage Configuration

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: [
    'context/**/*.{ts,tsx}',   // StoreContext (core business logic)
    'services/**/*.ts',         // supabaseService, supabaseClient, geminiService
    'components/**/*.tsx',      // All UI components
  ],
  exclude: ['node_modules', 'tests', 'electron'],
}
```

### 6.2 Coverage by Domain

| Domain | Components/Files | Test Coverage Focus |
|--------|-----------------|---------------------|
| **State Management** | `StoreContext.tsx` (~643 lines) | Heavy — 46 business logic tests + all component tests exercise this |
| **Data Access** | `supabaseService.ts` | 17 dedicated tests covering all CRUD operations |
| **Authentication** | `LoginPage.tsx` | 15 tests covering full 3-step flow |
| **POS** | `POS.tsx` (~665 lines) | 26 tests covering product grid, cart, checkout, invoices |
| **Inventory** | `Inventory.tsx` | 9 tests covering list, tabs, CRUD, stock |
| **Sidebar** | `Sidebar.tsx` | 7 tests covering nav, role filtering, branch |
| **Offline/Resilience** | Cross-cutting | 19 tests on localStorage persistence, API failure, input validation |
| **Performance** | Cross-cutting | 12 tests on large catalogs (500–1000 products), 100 rapid sales |

### 6.3 What's Covered vs. Not Covered

**Well-Covered:**
- Multi-store stock isolation (4 dedicated tests proving branch independence)
- Cart operations including overflow protection (stock limit enforcement via return value)
- Sale completion with financial calculations (subtotal, discount, total, cost tracking)
- Invoice generation and payment method recording
- Customer loyalty point accrual
- Product CRUD (add, update, delete with stock initialization)
- Branch management (add, update, stock initialization for new branches)
- Import/Export (JSON serialization, invalid data rejection)
- 3-step PIN authentication flow
- Role-based sidebar filtering (Admin sees all; Cashier restricted from Settings/Accounting/Suppliers/Branch Mgmt)
- Discount clamping (effectiveDiscount cannot exceed subtotal + tax, total never goes negative)

**Documented Bugs Found by Tests:**
- No input validation: negative prices, empty names, duplicate SKUs allowed
- No rollback on DB failure — optimistic UI creates state divergence
- No mutex protection on `completeSale` — rapid calls theoretically possible
- Invoice numbers use `Date.now()` — same-millisecond collision possible
- No double-submit protection on POS checkout button

**Not Covered (by unit tests):**
- `Dashboard.tsx`, `SalesHistory.tsx`, `Customers.tsx`, `Suppliers.tsx`, `Branches.tsx`, `Accounting.tsx`, `Settings.tsx` — These components lack dedicated unit tests (covered partially by E2E)
- `geminiService.ts` (AI integration) — No tests
- Electron `main.cjs`, `preload.cjs` — Tested only via mock assertions

---

## STEP 7: Development Workflow for Tests

### 7.1 Running Tests During Development

**1. Start watch mode while coding:**
```bash
npm run test:watch
```
Vitest monitors file changes and re-runs only affected tests. When you modify `POS.tsx`, only `POS.test.tsx` and potentially `business-logic.test.ts` re-run.

**2. Run the full suite before committing:**
```bash
npm test
```
This runs all 151 tests in a single pass. Expected output: `Tests: 151 passed (151)`.

**3. Generate coverage report:**
```bash
npm run test:coverage
```
Produces terminal output + `coverage/` directory with HTML report. Open `coverage/index.html` in a browser for detailed line-by-line analysis.

**4. Run E2E tests:**
```bash
npm run test:e2e        # Headless
npm run test:e2e:ui     # Interactive UI
```
Requires `npm run dev` to be running (auto-started by Playwright config).

### 7.2 Writing New Tests

**For a new component** (e.g., `Reports.tsx`):

```typescript
// tests/components/Reports.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Reports from '../../components/Reports';
import { StoreProvider, useStore } from '../../context/StoreContext';

// 1. Always mock Supabase
vi.mock('../../services/supabaseService', () => import('../mocks/supabaseService.mock'));

// 2. Auto-login wrapper
function AutoLoginReports() {
  const { login, users } = useStore();
  React.useEffect(() => {
    const admin = users.find(u => u.role === 'ADMIN');
    if (admin) login(admin);
  }, []);
  return <Reports />;
}

// 3. Render inside StoreProvider
function renderReports() {
  return render(<StoreProvider><AutoLoginReports /></StoreProvider>);
}

// 4. Write tests
describe('Reports', () => {
  it('renders report heading', () => {
    renderReports();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });
});
```

**For new business logic** (e.g., refund processing):

```typescript
// In tests/unit/business-logic.test.ts
describe('Refund Processing', () => {
  it('processRefund increases branch stock', () => {
    const { result } = renderStore();
    // ... test logic using act() + result.current
  });
});
```

### 7.3 Critical Patterns to Follow

| Pattern | Why |
|---------|-----|
| Always `vi.mock('../../services/supabaseService', ...)` | Prevents real DB calls; tests fail unpredictably without this |
| Wrap `fireEvent.click()` in `act()` | React 18 batches state updates; `act()` flushes them synchronously |
| Use `await waitFor(() => ...)` after render | `StoreContext` starts with `isLoading=true`; components render empty until loading completes |
| Use `fireEvent` over `userEvent` for non-interactive elements | happy-dom doesn't fully support `userEvent.click()` on arbitrary DOM nodes |
| Never rely on cross-test state | `afterEach` clears localStorage and resets mocks; each test starts fresh |

### 7.4 Debugging Failing Tests

1. **Run single file**: `npx vitest run tests/components/POS.test.tsx`
2. **Run specific test**: `npx vitest run -t "displays product price"`
3. **Debug DOM output**: Add `screen.debug()` inside a test to print the rendered HTML
4. **Check mock calls**: `expect(vi.mocked(supabaseService.insertProduct)).toHaveBeenCalledWith(...)`
5. **Watch mode with filter**: `npx vitest --reporter=verbose` then type `p` to filter by filename

### 7.5 CI/CD Integration Notes

- `npm test` exits with code 0 on success, non-zero on failure — standard CI gate
- Coverage reports in `lcov` format are compatible with Codecov, Coveralls, and SonarQube
- Playwright generates HTML reports and failure artifacts (screenshots, videos, traces)
- Recommended CI pipeline: `npm ci → npm test → npm run test:coverage → npm run test:e2e`

---

## Summary

The Hoard Lavish ERP test suite provides **151 unit/component/performance/resilience tests** plus **15 E2E specifications**. The architecture ensures full Supabase isolation, deterministic test state through localStorage cleanup, and comprehensive coverage of the core business logic (stock management, cart, sales, invoices, authentication). All 151 unit tests pass at **100%**.

---

*Generated by Senior QA Architect Assessment — Hoard Lavish ERP*
