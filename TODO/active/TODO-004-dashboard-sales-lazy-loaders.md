# TODO-004: Dashboard — central on-demand sales loaders (no mount fetch, scoped + cached)

- **ID:** 004
- **Priority:** P1
- **Status:** TODO

## Description

The Dashboard is the heaviest consumer of `salesHistory` (the unbounded
`fetchSales`). Migrate its widgets off the global mount-loaded `salesHistory` to a
**central, on-demand, scoped + cached** sales layer (`useDashboardSales`). Nothing
fetches on mount; each widget loads via its own button/toggle; widgets that share a
scope share one fetch; payloads are column-limited per widget.

> **Scope of this task = Dashboard only.** Other pages (POS, Accounting,
> Customers, SalesHistory, Branches) still read the global `salesHistory`, so this
> task does **not** remove `fetchSales` from `loadAll()`/`refreshFromSupabase()`
> yet — that final removal is a later TODO once every sales consumer is migrated.
> Here, the Dashboard simply stops reading global `salesHistory` and uses its own
> loaders.

Background + per-page sales usage: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Pattern to mirror for lazy/cached loaders: [TODO-003](TODO-003-customers-lazy-daily-cache.md).

> **Cache note:** the in-memory cache built here is later **promoted into the shared
> persisted bucket layer** in [TODO-005](TODO-005-sales-migrate-remaining-consumers-drop-fetchall.md)
> (server-side daily-sum aggregate + on-disk buckets), which Dashboard and the other
> five pages all share. Build the loaders so that layer can back them.

### Column tiers (limit the payload)

1. **Light, no `sale_items`** → `id, invoiceNumber, date, branchId, totalAmount, totalCost`
   — Metrics, Ledger, **daily** chart.
2. **Monthly chart** → amount only: `date, branchId, totalAmount` (no cost/profit).
3. **Full rows with `items`** (+ payment fields for the report) → Editable sales,
   Activity feed, Top performers, Day End Report.

### Central loaders (each: `{ data, loading, loaded, load() }`, cached by scope key)

| Loader | Serves (widgets) | Payload | Scope / trigger |
| --- | --- | --- | --- |
| `loadPeriodSales(dateFrom,dateTo,branch)` | Metrics, Unified Ledger | Tier 1 (light) | selected period + current branch; **Fetch** button |
| `loadRecentWithItems()` | Activity feed, Today's editable | Tier 3, `limit 20` | recent; one fetch + **Refresh** (activity), **Fetch** (editable filters to today/branch/≤10min) |
| `loadChart(mode,period)` | Revenue/Profit chart | Tier 1 daily / Tier 2 monthly; ideally a day×branch **aggregate** | all branches; **blurred + Show** button |
| `loadTopPerformers(dateFrom,dateTo,branch)` | Top performers | Tier 3 (or aggregate RPC) | selected period; **Fetch** button |
| `loadDayReport(dateFrom,dateTo,branch)` | Day End Report PDF | full rows + `paymentMethod,cashAmount,cardAmount,items` | selected period; on **Generate Report** |

## Date filter = scope + cache key + invalidation

- Daily → `dateFrom = dateTo = selectedDate`; Monthly → month bounds of `selectedMonth`.
- Cache key = `(filterMode, selectedDate|selectedMonth, branchId)`.
- **Changing the filter does NOT auto-refetch.** It invalidates loaded widgets →
  they revert to their button/blurred state; the user re-presses to load the new
  period. (Optional: small LRU so flipping back to a recent period is instant.)

## Steps

1. **Service fns** (`services/db/sales.ts`):
   - Add `fetchSalesSummary({ branchId, dateFrom, dateTo })` — Tier-1 projection,
     **no `sale_items`/`products` join** (`.select('id, invoice_number, date, branch_id, total_amount, total_cost')`).
   - (Optional, recommended) add an **aggregate** RPC/fn for the chart
     (`sum(total_amount)`, and `sum(total_cost)` for daily, grouped by day × branch)
     and/or top products by revenue/qty for a period. If skipped, derive
     client-side from the relevant loader.
   - Reuse existing `fetchSales({ branchId, dateFrom, dateTo, limit })` for Tier-3.
2. **Create `useDashboardSales`** (new `components/Dashboard/useDashboardSales.ts`
   or `hooks/`): implement the five loaders above with an in-memory cache keyed by
   scope, each exposing `{ data, loading, loaded, load() }`, plus an
   `invalidate()` used when the filter changes.
3. **Rewire Dashboard widgets** ([components/Dashboard/index.tsx](../../components/Dashboard/index.tsx))
   to read from the loaders instead of the global `salesHistory`:
   - Metrics (`filteredSales` [:47-54](../../components/Dashboard/index.tsx#L47-L54)) → `loadPeriodSales`, **Fetch** button.
   - Chart (`chartData` [:91-131](../../components/Dashboard/index.tsx#L91-L131)) → blurred overlay + **Show**; monthly = amount only (drop the `profit_*` series for monthly), daily keeps profit.
   - Today's editable (`recentEditableSales` [:178-184](../../components/Dashboard/index.tsx#L178-L184)) + Activity feed (`activityFeed` [:187-242](../../components/Dashboard/index.tsx#L187-L242)) → `loadRecentWithItems`; activity gets a **Refresh** button.
   - Top performers ([:86-88](../../components/Dashboard/index.tsx#L86-L88)) → `loadTopPerformers`, **Fetch** button.
   - Unified ledger (`ledger` [:150-173](../../components/Dashboard/index.tsx#L150-L173)) → `loadPeriodSales` (reuses the Metrics fetch), **Fetch** button.
   - Day End Report (`generateDayEndReport` [:273-555](../../components/Dashboard/index.tsx#L273-L555)) → `loadDayReport` on Generate.
   - Remove `salesHistory` from the Dashboard `useStore()` destructure once unused.
4. **No mount fetch:** ensure no loader runs on mount; all are button/toggle-driven.
   Wire the filter controls to `invalidate()` loaded widgets on change.
5. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `services/db/sales.ts` — `fetchSalesSummary` (+ optional aggregate)
- `components/Dashboard/useDashboardSales.ts` — **new** central loaders + cache
- `components/Dashboard/index.tsx` — per-widget buttons/blur, read loaders, drop global `salesHistory`, monthly chart = amount only, filter invalidation
- `tests/` — new completion test

## Acceptance criteria

- [ ] **Completion verification test** (this task only — `npx vitest run <this-test-file>`,
      not the whole suite; `NODE_ENV=test`; mock `db`). It must prove the loaders
      reproduce each widget's old output and honor scoping/triggers:

      **Plumbing assertions:**
      - No loader runs on mount (spy → 0 `fetchSales*`/`fetchSalesSummary` calls
        until a widget's `load()` is invoked).
      - `loadPeriodSales` is fetched once per `(filterMode, date, branch)` and
        **shared** by Metrics + Ledger (second consumer → 0 extra calls).
      - `fetchSalesSummary` selects the Tier-1 columns only (no `sale_items`).

      **Scenario A — Parity (same output as reading global `salesHistory`):** feed
      the loaders the same sales a `fetchSales` would return and assert each widget
      derives identical output:
      | Widget | Output to compare |
      | --- | --- |
      | Metrics | revenue / cost / profit / txCount for the period+branch |
      | Unified ledger | IN rows (invoice#, amount, date) for the period |
      | Today's editable | today+branch sales, top 20, ≤10min editable flag |
      | Activity feed | recent "Sold to X" items (uses `sale.items`), top 20 |
      | Top performers | best revenue / best qty product for the period |
      | Day report | payment breakdown + totalItemsSold + ledger for the period |

      **Scenario B — Change shows changed output:** changing the **date filter**
      invalidates loaded widgets (they revert to button/blur, no auto-refetch);
      pressing **Fetch** for the new period yields the new period's output. Adding
      a sale then pressing **Refresh** (activity) reflects it.

      **Scenario C — Scope/payload correctness:** monthly chart loader returns
      amount-only series (no profit) and daily returns revenue+profit; the Day
      report loader requests the full payload (`paymentMethod`, `cashAmount`,
      `cardAmount`, `items`) while Metrics/Ledger use the light projection.
- [ ] App runs; every Dashboard widget loads on its button/toggle, nothing on
      mount, and the Day End Report generates correctly for the selected period.
