# Dashboard

> One-line: the home/analytics screen — period KPIs (revenue, cost, profit, tx count), a per-branch
> sales/profit chart, top-performing products, a unified money ledger, an activity feed, a today's
> "recent sales" table with **Edit / Void**, and a **Day End Report** PDF export.
>
> Status: **LOCKED** · Last verified against code: 2026-07-01 · Commit: 6091b5f

Read this file (and `docs/fixes/dashboard.md`) before editing the Dashboard feature. If the code and
this doc disagree, **the code wins** — fix the doc in the same change. The sale **Edit/Void** UI lives
here but the actual writes (`updateSale`, `deleteSale`) are POS-unit actions — see `docs/map/pos.md`.

---

## Key files

| File | Role |
|------|------|
| [components/Dashboard/index.tsx](../../components/Dashboard/index.tsx) (1769 lines) | UI entry point — KPIs, chart, top performers, ledger, activity feed, recent-sales edit/void modals, Day End Report PDF (`jsPDF` + `autoTable`). |
| [components/Dashboard/useDashboardSales.ts](../../components/Dashboard/useDashboardSales.ts) | Dashboard-local lazy sales loaders with per-key caches: `periodSales`, `recentWithItems`, `chart`, `topPerformers`, `dayReport`. **Bypasses global `salesHistory`** entirely. |
| [services/db/sales.ts](../../services/db/sales.ts) | DB layer: `fetchSalesSummary` (column-projected, the KPI/chart/day-report read), `fetchSales` (full rows + items, recent list), `fetchSalesForTopPerformers`, `mapExchange`. |
| [services/db/expenses.ts](../../services/db/expenses.ts) | `fetchExpenses({branchId,dateFrom,dateTo})` — the ledger's OUT side. |
| [services/db/stockMovements.ts](../../services/db/stockMovements.ts) | `fetchStockMovements({branchId,limit:30,excludeSaleOuts:true})` — activity feed. |
| [context/StoreContext.tsx](../../context/StoreContext.tsx) | Source of `products`, `stockTransfers`, `exchangeHistory`, `currentUser`, `branches`, and the `updateSale`/`deleteSale`/`loadExchangesForPeriod` actions the UI calls. |
| [supabase/migrations/009_void_sale.sql](../../supabase/migrations/009_void_sale.sql) | `fn_void_sale` — what **Void** runs (atomic: restore stock, reverse loyalty, DELETE). |

## How it works

**Data is loaded on demand, per filter, not from global state.** The component owns a `filterMode`
(`daily`/`monthly`) + `selectedDate`/`selectedMonth`, and instantiates `useDashboardSales(...)`
(`index.tsx:58`). That hook auto-loads `periodSales`, `chart`, `topPerformers`, and `recentWithItems`
on mount and whenever their fetch params change (`useDashboardSales.ts:242-245`). Each loader has its
own in-memory cache keyed `filterMode:period:branchId`; changing the filter calls `dashSales.invalidate()`
(`index.tsx:67-73`) which clears the period-sensitive caches **but deliberately keeps `recentWithItems`**
(it is always "today", not date-filter sensitive — `useDashboardSales.ts:234`).

- **KPIs** (`index.tsx:114-122`): `revenue = Σ periodSales.totalAmount + Σ filteredExchanges.difference`;
  `cost = Σ totalCost`; `profit = revenue − cost`; `txCount = sales + exchanges`. `periodSales` comes from
  `fetchSalesSummary({branchId,dateFrom,dateTo})` (id/invoice/date/branch/amount/cost/customer only).
- **Chart** (`index.tsx:142-183`): `fetchSalesSummary({dateFrom,dateTo})` **with no `branchId`** (all
  branches), then buckets every sale row by day client-side into per-branch `rev_<id>` / `profit_<id>`
  series. Daily mode = last 7 days ending at `selectedDate`; monthly = each day of the month.
- **Top performers** (`index.tsx:137-139`): `fetchSalesForTopPerformers` pulls every sale + its
  `sale_items` for the period, then `getTopRevenueAndQuantityProducts` (`utils/revenue.ts`) ranks them.
- **Ledger** (`index.tsx:220-240`): merges `periodSales` (IN), `fetchExpenses` (OUT), `stockTransfers`
  (IN), and branch-scoped `filteredExchanges` (IN/OUT by sign), sorted by `parseBusinessDate` desc.
- **Activity feed** (`index.tsx:256-311`): `recentWithItems` sales + `recentMovements` (non-sale-out
  stock movements), newest 20.
- **Recent editable sales** (`index.tsx:247-253`): `recentWithItems` filtered to **today + current
  branch**, newest 20 — the only rows that get Edit/Void buttons.

**Edit a sale** (`handleUpdateSale`, `index.tsx:723`): opens an edit cart, then calls
`updateSale(editingSale, editCart, editDiscount, editCustomerId)` (a POS-unit StoreContext action) and
shows a printable edited-invoice modal. ⚠️ `updateSale` re-runs `completeSaleRPC` which is INSERT-only —
see fixes **POS-02 / DASH-01**.

**Void a sale** (`handleDeleteSale`, `index.tsx:743`): confirm modal → `await deleteSale(id)` →
`fn_void_sale` (atomic restore-stock + reverse-loyalty + DELETE) then a global `refreshFromSupabase()`.
The Dashboard's own `recentWithItems`/activity caches are **not** reloaded afterward (DASH-02).

**Day End Report** (`handleGenerateDayReport`, `index.tsx:342`): lazily loads
`fetchSalesSummary({...,extended:true})` (adds `payment_method`, `cash_amount`, `card_amount`,
`sale_items(quantity)`), then `generateDayEndReport` builds a `jsPDF` doc — payment-method breakdown
(Cash/Card/COD/Cash+Card/PayHere/Online/MintPay, with split amounts allocated to cash vs card), gross/
net sales, items sold (sales + exchange `newItems`), avg bill/item, and the ledger table.

## Business rules

- **Who can do what:** `role = currentUser?.role || 'CASHIER'`; `isAdmin = role === 'ADMIN'`
  (`index.tsx:26-27`). **`isAdmin` gates only the rendering** of the financial Overview KPIs
  (`index.tsx:1234`) and the profit chart (`index.tsx:1353`). **Edit and Void are NOT role-gated**
  (`index.tsx:1515-1526`) — any logged-in user (incl. CASHIER) who can reach the Dashboard can edit/void
  today's sales. **This split is intentional (confirmed):** financials are admin-only, but edit/void
  stays open (matches the POS "PIN-phase, no role gating" stance, POS-05). The loaders still run for
  everyone, so the financial gate is **UI-only**: a CASHIER's client fetches the data and it is just
  hidden (DASH-03 — egress, not an intent gap).
- **Edit/Void window (proven):** only sales whose `date` starts with **today** AND are in the
  **current branch** appear in the editable table (`recentEditableSales`, `index.tsx:247-253`;
  `isSaleEditable`, `:243`). There is no enforced minute-level time limit. Older sales are not
  editable/voidable from here.
- **Void = hard delete (proven, inherited from POS):** `deleteSale` → `fn_void_sale` restores stock,
  reverses loyalty (`GREATEST(0,…)`), then DELETEs the row. No soft-void/status flag (see POS-09).
- **Exchange revenue (proven):** counted as `difference` (signed) in KPIs and the ledger; exchange
  `newItems` quantities are added to "items sold" in the Day End Report (`index.tsx:373-374`).

## Actions & Tools

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|
| `useDashboardSales` loaders | Lazy, cached per `filterMode:period:branch` | `fetchSalesSummary`, `fetchSales`, `fetchSalesForTopPerformers` |
| `fetchSalesSummary` | Column-projected period read (KPIs/chart/day-report) | `sales` (+`sale_items(quantity)` when `extended`) |
| `fetchSales({limit:20})` | Full recent sale rows + nested items | `sales`, `sale_items`, `products` |
| `fetchExpenses` | Ledger OUT side | `expenses` |
| `fetchStockMovements({limit:30,excludeSaleOuts})` | Activity feed | `stock_movements` |
| `loadExchangesForPeriod` | Pull exchanges older than the default 2-week window | `exchanges`, `exchange_items` |
| `updateSale` *(POS action)* | Edit a today sale | `completeSaleRPC` — **INSERT-only, breaks on UNIQUE invoice** (POS-02 / DASH-01) |
| `deleteSale` *(POS action)* | Void a today sale | `fn_void_sale` then `refreshFromSupabase()` |
| `jsPDF` + `jspdf-autotable` | Day End Report + edited-invoice print | client-only; print via `window.electronAPI.silentPrint` |

## Gotchas (surprising-but-intentional)

- **No global `salesHistory`.** The Dashboard intentionally fetches its own sales via `useDashboardSales`
  rather than reading shared state — keeps the global store lean. Don't "fix" KPIs by reaching for
  `salesHistory`; it isn't populated for this screen.
- **`recentWithItems` is never date-invalidated.** `invalidate()` skips it on purpose because it is
  always "today". It is also not reloaded after Edit/Void (that's the bug DASH-02, not the design).
- **Chart fetches all branches.** The chart read omits `branchId` by design (it draws a series per
  branch), so it is the widest read on the screen — egress scales with org-wide sales (DASH-04).
- **`isAdmin` only hides UI.** The financial data is fetched regardless of role; the flag never gates a
  query.
- **Dynamic Tailwind classes** (`getColorClasses`, `index.tsx:323`) build `bg-${color}-50` etc. at
  runtime — these can be purged by Tailwind's JIT if not safelisted (DASH-05).

## Tests

| Path | Covered? | Test file |
|------|----------|-----------|
| `fetchSalesDailyTotals` RPC mapping | ✅ | `services/db/sales.dailyTotals.test.ts` |
| `useDashboardSales` loaders / caching | ❌ | — (DASH-06) |
| Day End Report payment breakdown math | ❌ | — (DASH-06) |
| Chart per-branch bucketing | ❌ | — (DASH-06) |
| Edit/Void handlers | ❌ | — (DASH-06) |

---

<!-- changelog: append one line per code change that touched this unit -->
- 2026-07-01 6091b5f — initial documentation. LOCKED: edit/void left open by design (financials admin-only) — confirmed.
