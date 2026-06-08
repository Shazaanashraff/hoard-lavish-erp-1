# TODO-005: Sales — migrate POS/Accounting/Customers/SalesHistory/Branches to scoped fetches + shared persisted cache, then drop `fetchSales` from the fetch-all

- **ID:** 005
- **Priority:** P1
- **Status:** TODO

## Description

This is the **final removal** referenced by [TODO-004](TODO-004-dashboard-sales-lazy-loaders.md):
migrate the **five remaining** consumers of the global `salesHistory` slice
(POS, Accounting, Customers, SalesHistory, Branches) onto **scoped, on-demand**
sales fetches backed by a **shared, persisted, bucketed cache layer**, then delete
the unbounded `db.fetchSales()` from **both** fetch-all paths (`loadAll` +
`refreshFromSupabase`) and stop the `sales`/`sale_items` realtime events from
triggering a full-DB refetch.

`fetchSales` is the single biggest egress payload (full history + nested
`sale_items` + joined `products`, no bound). After this task nothing loads the
whole sales table on mount or on poll — each page fetches only the rows/sums it
shows, old history is served from immutable on-disk buckets, and totals are
computed **server-side** so egress no longer grows with history.

> **Depends on [TODO-006](TODO-006-sales-daily-totals-rpc.md)** (the
> `fn_sales_daily_totals` RPC + `fetchSalesDailyTotals` wrapper that Group A is
> built on — split out because it's a Supabase migration, a different kind of change
> that can't be exercised by this task's mock-db gate) **and on
> [TODO-004](TODO-004-dashboard-sales-lazy-loaders.md)** (Dashboard is the heaviest
> reader, migrated first). This task **promotes TODO-004's in-memory
> `useDashboardSales` cache into the shared persisted layer below**, so Dashboard
> and these five pages share one cache. Sibling per-page tasks:
> [TODO-001](TODO-001-local-branches.md) (Branches), [TODO-003](TODO-003-customers-lazy-daily-cache.md) (Customers).

Background + per-page sales usage: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Current `fetchSales`: [services/db/sales.ts:106-127](../../services/db/sales.ts#L106-L127).

## Shared cache layer — 3 shape-groups (one module, shared with Dashboard)

Build a single cache module (e.g. `services/salesCache.ts` + a `useSalesData`
hook) that TODO-004's loaders also sit on. Fetches group by **shape**, because the
payloads differ:

| Group | Shape (columns) | Serves | Cache strategy |
| --- | --- | --- | --- |
| **A — Aggregate sums** | server-computed numbers only: `sum(total_amount)`, `sum(total_cost)`, count — grouped by **day × branch** | Dashboard metrics + chart, Accounting period income, Branches per-branch sum | **persisted daily buckets**, long-lived (see below) |
| **B — Light rows** | `id, invoice_number, date, branch_id, total_amount, total_cost` (no `sale_items`) | SalesHistory list, Dashboard ledger | paginated (`limit`/`offset`), short-lived in-memory |
| **C — Full rows** | full row + `sale_items` (+ payment fields where needed) | POS exchange lookup, Customers history, Day-End report, activity feed | on-demand by key (saleId / customerId / search), transient |

Group keys always include **`branchId`**. Group A is the shared long-lived cache;
B and C are transient. Where a page's need overlaps Dashboard's (e.g. Accounting
income == a Group-A period sum the Dashboard metrics already fetched), it reads the
**same cache entry**, no second fetch.

## Group A — server-side aggregation + persisted daily buckets

**Server aggregate (issue 1).** Provided by **[TODO-006](TODO-006-sales-daily-totals-rpc.md)**:
the `fn_sales_daily_totals(p_branch_id, p_date_from, p_date_to)` RPC (one row per
`(date, branch_id)` with `sum(total_amount)`, `sum(total_cost)`, `count(*)`) and its
`fetchSalesDailyTotals(...)` wrapper. Totals are computed in the DB → only a handful
of rows come back, **egress is O(days) not O(sales)**. Metrics slice amount+cost,
Accounting slices amount, Branches groups by branch. This task **consumes** that
wrapper; it does not create the RPC.

**Persisted daily buckets (issue 2), stored in app data:**
- **Hot window = last 30 days:** not bucketed long-term — fetched fresh / short TTL
  (may still change inside the 10-min void window or via rare edits).
- **Cold = older than 30 days:** aggregated into **immutable daily buckets**
  keyed `(branch_id, YYYY-MM-DD)`, written to disk, essentially never refetched. Any
  requested date range is **composed from buckets** (so "Jan 1–15" and "Jan 1–31"
  reuse the same day buckets — no overlapping refetch).
- **Persistence:** store buckets in Electron **app data** so they survive app
  updates. Default: renderer `localStorage`/IndexedDB (lives under `userData`,
  survives updates); if explicit control is wanted, a JSON file in
  `app.getPath('userData')` via IPC. **If the cache is missing/cleared, refetch**
  the needed buckets and repopulate.
- **Safety re-aggregation (issue 3):** void is a 10-min window and edits effectively
  never touch sales older than a month, so cold buckets are treated as stable. As a
  backstop, re-aggregate buckets on a **2–4 week** cadence (and invalidate a bucket
  immediately if a mutation lands on its day+branch — see optimistic note).

## Fresh-sale visibility (issue 4)

With no global `salesHistory`, a new sale must still surface:
- **Same machine, immediately:** on `completeSale`, after writing to Supabase, also
  bump the **local** day bucket for that branch and prepend to the **activity
  cache** (Group C), so the dashboard/page reflects it without a refetch.
- **Other machines:** the user presses the **Refresh** button (activity feed /
  metrics / per-branch) to pull the latest — acceptable, this is the only cross-device path.

## Per-page migration

| Page | Site | Today reads global `salesHistory` for | Replace with |
| --- | --- | --- | --- |
| POS | [index.tsx:15](../../components/POS/index.tsx#L15), [:1067-1074](../../components/POS/index.tsx#L1067-L1074) | `filteredExchangeSales` — lookup of one original sale by invoice#/customer | **Group C** single-row search: `fetchSales({ search, limit: 10 })` server-side `.or(invoice,customer)`, debounced; fetches only the matched row(s) + its items |
| Accounting | [Accounting.tsx:11](../../components/Accounting.tsx#L11), [:38](../../components/Accounting.tsx#L38) | `salesHistory.filter(isInPeriod)` → income total | **Group A** period sum on period-select (reuses Dashboard's metrics cache entry if same scope); cache-miss → fetch buckets and show |
| Customers | [Customers.tsx:10](../../components/Customers.tsx#L10), [:29](../../components/Customers.tsx#L29) | `filter(customerId === selected.id)` → one customer's history | **Group C** `fetchSales({ customerId })` only when a profile opens; payload = exactly the columns the profile shows, nothing more |
| SalesHistory | [SalesHistory.tsx:48](../../components/SalesHistory.tsx#L48), [:63-101](../../components/SalesHistory.tsx#L63-L101) | whole-slice filter by period/branch/date/search | **Group B** server-filtered page: first 10 rows matching the active filter; **Show more** = `offset += 10` on the same filtered query; search/date/branch run in the DB |
| Branches | [Branches.tsx:7](../../components/Branches.tsx#L7), [:32-33](../../components/Branches.tsx#L32-L33) | `filter(branchId).reduce(+total)` → per-branch total card | **Group A** `fn_sales_daily_totals` grouped by branch, once on open; **Refresh** button to re-pull, else show cached |

Metrics / per-branch sum: fetched **once on page open** (from Group A cache), with a
**Refresh** button; otherwise show the cached value from the initial fetch.

## The fetch-all wiring to remove (after all five are migrated)

- `loadAll` — `db.fetchSales()` [StoreContext.tsx:490](../../context/StoreContext.tsx#L490) → `setSalesHistory(...)` [:533](../../context/StoreContext.tsx#L533).
- `refreshFromSupabase` — `db.fetchSales()` [:582](../../context/StoreContext.tsx#L582) → `setSalesHistory(...)` [:600](../../context/StoreContext.tsx#L600).
- Realtime `sales` / `sale_items` must **no longer** call the full `refreshFromSupabase`.
- **Optimistic writers** (`completeSale` [:1060](../../context/StoreContext.tsx#L1060),
  `updateSale` [:1174](../../context/StoreContext.tsx#L1174), `deleteSale`
  [:1230](../../context/StoreContext.tsx#L1230)) keep working via the fresh-sale
  path above (bump local bucket + activity cache; invalidate the affected day bucket).

## Steps

1. **DB + aggregate wrapper:** done in **[TODO-006](TODO-006-sales-daily-totals-rpc.md)**
   (migration `015_sales_daily_totals.sql` + `fetchSalesDailyTotals`). This task
   **starts from that being merged** — no migration work here.
2. **Service** (`services/db/sales.ts`): extend `FetchSalesOptions` with
   `customerId`, `search`, `offset`, and a **shape** flag (`light` = Group-B columns,
   no `sale_items`; `full` = current). (`fetchSalesDailyTotals` already exists from TODO-006.)
3. **Shared cache** (`services/salesCache.ts` + `useSalesData`): implement Groups
   A/B/C; persist Group-A daily buckets to app data (localStorage/IndexedDB or
   `userData` JSON); compose ranges from buckets; refetch on miss; 2–4 week
   re-aggregation; bucket invalidation on sale mutation. **Refactor TODO-004's
   `useDashboardSales` to consume this layer** (shared entries).
4. **POS** — exchange lookup → Group-C debounced search; drop `salesHistory` from `useStore()` [:15](../../components/POS/index.tsx#L15).
5. **Accounting** — period income → Group-A on period-select; drop `salesHistory`.
6. **Customers** — per-customer history → Group-C on profile open, minimal payload; drop `salesHistory`.
7. **SalesHistory** — server-filtered 10 + Show-more (`offset`); search/date/branch in DB; drop `salesHistory`.
8. **Branches** — per-branch sum → Group-A grouped by branch + Refresh; drop `salesHistory`.
9. **Drop from fetch-all** — remove `db.fetchSales()` from `loadAll` + `refreshFromSupabase`; `sales`/`sale_items` realtime stops the full refetch; wire optimistic writers to the fresh-sale path.
10. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `services/db/sales.ts` — `customerId`/`search`/`offset`/shape options (the
  `fetchSalesDailyTotals` aggregate + its migration land in [TODO-006](TODO-006-sales-daily-totals-rpc.md))
- `services/salesCache.ts` + `hooks/useSalesData.ts` — **new** shared persisted cache (Groups A/B/C)
- `components/Dashboard/useDashboardSales.ts` — refactor onto shared layer
- `components/POS/index.tsx`, `components/Accounting.tsx`, `components/Customers.tsx`, `components/SalesHistory.tsx`, `components/Branches.tsx` — per-page migration, drop `salesHistory`
- `context/StoreContext.tsx` — remove `fetchSales` from `loadAll` + `refreshFromSupabase`, per-table realtime, optimistic fresh-sale path
- `tests/` — new completion test

## Acceptance criteria

- [ ] **Completion verification test** (this task only — `npx vitest run <this-test-file>`,
      not the whole suite; `NODE_ENV=test`; mock `db`). It must prove:
      - **No global sales load:** after `loadAll`, after `refreshFromSupabase`, and
        after a `sales`/`sale_items` realtime event, the `fetchSales` spy is **not**
        called and `salesHistory` is **not** bulk-populated.
      - **Server-side sums (Group A):** metrics / Accounting income / per-branch sum
        call `fetchSalesDailyTotals` (the RPC), **not** row fetches; egress does not
        scale with sale count.
      - **Buckets + persistence:** cold (>30d) ranges are served from persisted daily
        buckets with **zero** refetch on a repeat range; clearing the cache forces a
        refetch; overlapping ranges reuse shared day buckets.
      - **Per-page scoped fetch & parity:** POS (single-row search), Accounting
        (period), Customers (per-customer, minimal columns), SalesHistory (filtered
        10 + Show-more `offset`), Branches (per-branch sum) each fetch **only** on
        their action/filter, with the expected scoped args, and reproduce the same
        output they derived from the global slice before.
      - **Shared cache:** an Accounting period sum that matches a scope the Dashboard
        already loaded yields **0** extra fetches (same Group-A entry).
      - **Fresh sale:** a `completeSale` updates the local day bucket + activity cache
        (visible same-machine without refetch); pressing **Refresh** pulls latest.
      - **No-regression parity (everything that worked before still works):** for
        **each** of the five pages, feed the migrated path the *same* sale data the
        old global-`salesHistory` path saw and assert byte-for-byte identical
        rendered output (POS exchange match, Accounting income, a customer's history,
        the SalesHistory list + Show-more, per-branch totals). The migration must
        change **what is fetched**, never **what the user sees**.
- [ ] No component still destructures `salesHistory` from `useStore()`.
- [ ] App runs; all five pages show correct sales on their own buttons/filters,
      nothing downloads the full sales table on mount or poll, and Group-A totals
      come from the server aggregate.
