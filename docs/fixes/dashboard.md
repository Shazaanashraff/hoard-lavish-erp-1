# Findings — Dashboard

> Companion to `docs/map/dashboard.md`. One finding per block. Newest issues at the top of their
> severity tier. When a finding is fixed, move it to the "Resolved" section with the commit sha.

Severity and category legend lives in [README.md](./README.md). Quick reminder:
**P0** data-integrity/broken · **P1** EGRESS (primary goal) · **P2** perf/security · **P3** cleanup/tests.

---

## Open

### DASH-01 · P0 · BUG · `context/StoreContext.tsx` (`updateSale`) via `components/Dashboard/index.tsx:725`
- **Problem:** Dashboard **Edit** calls `updateSale`, which re-runs `completeSaleRPC` (`fn_complete_sale`).
  That RPC is **INSERT-only** — it never updates the existing `sales`/`sale_items` rows. This is the same
  defect as POS-02, surfaced through the Dashboard edit UI.
- **Impact:** editing a sale either inserts a duplicate sale or throws on the `invoice_number` UNIQUE
  constraint; the original is not actually modified, and stock/loyalty deltas can double-apply.
- **Fix:** see POS-02 — add an `fn_update_sale` RPC (or void+recreate atomically). Until then, Edit is
  unsafe; consider hiding it. Track the single fix under POS-02; DASH-01 is the Dashboard pointer.

### DASH-04 · P1 · EGRESS · `components/Dashboard/useDashboardSales.ts:155` (chart) + `services/db/sales.ts:303` (top performers)
- **Problem:** the chart calls `fetchSalesSummary({dateFrom,dateTo})` with **no `branchId`** and **no
  limit**, pulling every org-wide sale row for the window (7 days daily / whole month monthly) and
  aggregating per-day/per-branch in JS. Top performers (`fetchSalesForTopPerformers`) likewise fetches
  every sale **plus its `sale_items`** for the period with no limit. Meanwhile a pre-aggregating RPC
  `fn_sales_daily_totals` already exists (`sales.ts:285`, returns date/branch/sum_amount/sum_cost/tx_count)
  and is **unused** by the chart.
- **Impact:** monthly view on a busy multi-branch org downloads thousands of rows (and all their items
  for top performers) every time the filter changes — the largest egress on the screen, repeated per
  client and recomputed in the browser.
- **Fix:** drive the chart from `fn_sales_daily_totals` (already tested) instead of raw rows. For top
  performers, add a server-side aggregation RPC (`GROUP BY product`) that returns ranked totals rather
  than streaming every `sale_item`.

### DASH-03 · P2 · SECURITY · `components/Dashboard/index.tsx:1234,1353` + `useDashboardSales.ts:242-245`
- **Problem:** `isAdmin` only gates **rendering** of financial KPIs and the profit chart. The loaders
  auto-run for every role on mount, so a CASHIER's client still fetches revenue/profit/top-performer/
  period-summary data — it is merely hidden in the DOM. (Consistent with the open-RLS posture, POS-05,
  but worth noting: the "admin only" label is UI-deep, not enforced.)
- **Impact:** financial figures are present in a non-admin client's memory/network tab; and non-admins
  pay the egress for data they can't see (compounds DASH-04).
- **Fix:** the admin-only-financials / open-edit-void split is **intended** (confirmed) — so this stays
  a pure egress/exposure item, not a gating change. Gate the loader *calls* on `isAdmin` so non-admins
  don't fetch chart/top-performers/financial-summary data they can't see. (Server-side enforcement is
  out of scope while the open-RLS PIN posture holds, POS-05.)

### DASH-02 · P2 · CONSISTENCY · `components/Dashboard/index.tsx:743-758`
- **Problem:** after `deleteSale` (Void) or `updateSale` (Edit) succeeds, the Dashboard's own
  `dashSales.recentWithItems` cache (and the activity feed built from it) is **not** reloaded.
  `invalidate()` only runs on filter change (`index.tsx:67-73`) and intentionally skips `recentWithItems`.
- **Impact:** a voided/edited sale lingers in the "Recent Sales" table (still showing Edit/Void buttons)
  and in the activity feed until the component remounts or the filter changes — the user can attempt to
  void an already-voided sale.
- **Fix:** call `dashSales.recentWithItems.reload()` (and refresh `recentMovements`) in the success path
  of `handleDeleteSale` / `handleUpdateSale`.

### DASH-05 · P3 · BUG · `components/Dashboard/index.tsx:323`
- **Problem:** `getColorClasses` returns dynamically-interpolated Tailwind classes (`bg-${color}-50`,
  `text-${color}-600`, `bg-${color}-400`). Tailwind's JIT cannot see these strings at build time and may
  purge them.
- **Impact:** activity-feed color accents (blue/rose/amber/indigo/emerald) may render with no
  background/text color in the production build.
- **Fix:** safelist the color set in `tailwind.config`, or map to fully-static class strings.

### DASH-06 · P3 · TEST · `components/Dashboard/*`
- **Problem:** no tests cover `useDashboardSales` (loader caching/invalidation), the Day End Report
  payment-method math (split allocation, COD→cash, exchange items-sold), the chart's per-branch
  bucketing, or the Edit/Void handlers.
- **Impact:** silent regressions in money totals on the report and in the analytics math go uncaught.
- **Fix:** unit-test the pure pieces — extract `generateDayEndReport`'s totals math and the chart
  bucketing into testable functions and add Vitest coverage.

---

## Resolved
<!-- - DASH-NN · fixed in <sha> <date> — one line on the fix. -->
