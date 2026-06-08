# TODO-007: Stock movements — lazy/scoped fetch for Inventory history + Dashboard activity feed, drop `fetchStockMovements` from the fetch-all

- **ID:** 007
- **Priority:** P1
- **Status:** TODO

## Description

`db.fetchStockMovements()` is pulled **in full** on every `loadAll` and every
`refreshFromSupabase` (30s poll / realtime), and the whole `stock_movements` table
is unbounded — it grows with every sale, adjustment, transfer, **and every product
edit** (each edit writes an `ADJUSTMENT` row). Migrate its **two and only two**
consumers onto **scoped, on-demand** fetches, then remove `fetchStockMovements`
from both fetch-all paths and stop the `stock_movements` realtime event from
triggering a full-DB refetch.

`stockHistory` (the global slice this fills) is read in exactly two places —
verified by grep, nothing else destructures it from `useStore()`:

| Consumer | Site | Reads `stockHistory` for | Replace with |
| --- | --- | --- | --- |
| **Inventory → Stock History tab** | [Inventory/index.tsx:846](../../components/Inventory/index.tsx#L846), [:871](../../components/Inventory/index.tsx#L871) | `stockHistory.filter(branchId === currentBranch)` rendered as the ADJUSTMENTS table (already gated behind the tab) | **lazy fetch on tab open:** `fetchStockMovements({ branchId, limit })` + **Show more** (`offset`); branch/date filter run in the DB |
| **Dashboard → Activity feed (stock half)** | [Dashboard/index.tsx:205-237](../../components/Dashboard/index.tsx#L205-L237) | recent `IN` / non-sale `OUT` / `ADJUSTMENT` rows, merged with recent sales, sorted, sliced to 20 | **recent-only loader:** `fetchStockMovements({ branchId, limit: ~30 })`, merged with TODO-004's recent sales; **Refresh** button |

> **Depends on [TODO-004](TODO-004-dashboard-sales-lazy-loaders.md)** — 004 already
> migrates the activity feed's **sales** half onto `loadRecentWithItems` and is the
> task that owns the Dashboard activity-feed wiring. This task migrates the **stock**
> half of that same feed and removes `stockHistory` from the Dashboard
> `useStore()` destructure. Sibling fetch-all-removal tasks:
> [TODO-005](TODO-005-sales-migrate-remaining-consumers-drop-fetchall.md) (sales),
> [TODO-002](TODO-002-products-realtime-qty-cache.md) (products).

> **Not TODO-002's territory.** TODO-002 handles live product **quantities**
> (`product_branch_stock` deltas + catalog cache). This task handles the
> `stock_movements` **audit log** (history rows). They touch different tables and
> different consumers — no overlap.

Background + per-page usage: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Current `fetchStockMovements`: [services/db/stockMovements.ts:25-39](../../services/db/stockMovements.ts#L25-L39).

## Design notes (keep it simple — no RPC, no buckets)

Unlike sales Group A, **no server-side aggregation is needed** here: both consumers
want a *list* of movement rows, not sums. So this is just two **scoped, bounded**
list fetches — no Postgres RPC, no persisted daily buckets. A shared cache module
is **optional**, not required; an in-memory result per scope is enough.

- **Bound both fetches.** The table is unbounded, so never fetch the whole branch
  history. Inventory = `limit` + **Show more** (`offset`); Dashboard feed = recent
  `limit` only (it slices to 20 anyway — fetch ~30 so the merge with sales still has
  enough to fill 20).
- **Preserve the feed's filter semantics exactly.** The activity feed today shows
  `IN`, `OUT` **where `reason` does not start with `"Sale"`**, and `ADJUSTMENT`
  (with the `"Product edited"` → "Product updated" special-case). Reproduce this
  identically; optionally push the `reason not like 'Sale%'` filter **server-side**
  to trim the payload (must yield the same rows the client filter did).
- **Fresh movement visibility (same machine):** the optimistic writers already
  prepend locally — `setStockHistory(prev => [...new, ...prev])` in `completeSale`
  [:1058](../../context/StoreContext.tsx#L1058), `updateSale` [:1172](../../context/StoreContext.tsx#L1172),
  `deleteSale` [:1228](../../context/StoreContext.tsx#L1228), `adjustStock`/edit
  [:852](../../context/StoreContext.tsx#L852), `transferStock`
  [:1567](../../context/StoreContext.tsx#L1567), etc. Keep these so the Inventory tab
  and activity feed reflect a local mutation **without** a refetch. Cross-device →
  the **Refresh** button.

## The fetch-all wiring to remove (after both consumers are migrated)

- `loadAll` — `db.fetchStockMovements()` [StoreContext.tsx:491](../../context/StoreContext.tsx#L491) → `setStockHistory(...)` [:534](../../context/StoreContext.tsx#L534).
- `refreshFromSupabase` — `db.fetchStockMovements()` [:583](../../context/StoreContext.tsx#L583) → `setStockHistory(...)` [:601](../../context/StoreContext.tsx#L601).
- Realtime `stock_movements` [:655](../../context/StoreContext.tsx#L655) must **no longer** call the full `refreshFromSupabase`.
- **Optimistic writers** (the `setStockHistory(prev => [...])` prepends listed
  above) keep working unchanged — that is the same-machine fresh path.

## Steps

1. **Service** (`services/db/stockMovements.ts`): add `offset` to
   `FetchStockMovementsOptions` (for Inventory Show-more). Optionally add a flag to
   exclude sale-driven `OUT` rows server-side for the feed (`reason not like 'Sale%'`).
   Leave `fetchStockMovements`'s existing behavior intact.
2. **Inventory** ([components/Inventory/index.tsx](../../components/Inventory/index.tsx)):
   fetch movements **only when the ADJUSTMENTS tab is opened**, scoped to
   `currentBranch.id` with a `limit`; add **Show more** (`offset += limit`). Drop
   `stockHistory` from the `useStore()` destructure [:31](../../components/Inventory/index.tsx#L31).
3. **Dashboard** ([components/Dashboard/index.tsx](../../components/Dashboard/index.tsx)
   + the TODO-004 loaders): add a `loadRecentStockMovements({ branchId, limit })`
   loader (or fold into 004's activity loader); the activity feed merges its rows
   with the recent sales half and keeps the existing `IN`/non-sale-`OUT`/`ADJUSTMENT`
   mapping; wire the existing activity **Refresh** to re-pull. Drop `stockHistory`
   from the Dashboard `useStore()` destructure [:19](../../components/Dashboard/index.tsx#L19).
4. **Drop from fetch-all** — remove `db.fetchStockMovements()` from `loadAll` +
   `refreshFromSupabase`; `stock_movements` realtime stops the full refetch; keep the
   optimistic `setStockHistory` prepends.
5. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `services/db/stockMovements.ts` — add `offset` (+ optional server-side sale-`OUT` exclude)
- `components/Inventory/index.tsx` — lazy tab fetch + Show-more, drop global `stockHistory`
- `components/Dashboard/index.tsx` (+ TODO-004 loaders) — recent-movements loader for the feed, drop global `stockHistory`
- `context/StoreContext.tsx` — remove `fetchStockMovements` from `loadAll` + `refreshFromSupabase`, stop `stock_movements` realtime full-refetch, keep optimistic prepends
- `tests/` — new completion test (colocated, mirrors `utils/revenue.test.ts`)

## Acceptance criteria

- [ ] **Completion verification test** (this task only — `npx vitest run <this-test-file>`,
      not the whole suite; `NODE_ENV=test`; mock `db`/realtime). It must prove:
      - **No global movements load:** after `loadAll`, after `refreshFromSupabase`,
        and after a `stock_movements` realtime event, the `fetchStockMovements` spy is
        **not** called for a full/unbounded pull and `stockHistory` is **not**
        bulk-populated.
      - **Inventory tab — scoped fetch & parity:** opening the ADJUSTMENTS tab calls
        `fetchStockMovements({ branchId: currentBranch.id, limit })` once (not on
        mount, not before the tab opens); **Show more** issues `offset += limit` on
        the same scoped query; the rows rendered are **identical** to what the old
        `stockHistory.filter(branchId === currentBranch)` produced for the same data.
      - **Dashboard feed — recent fetch & parity:** the activity feed's stock events
        (`IN`, `OUT` excluding `reason` starting `"Sale"`, `ADJUSTMENT` incl. the
        "Product edited" → "Product updated" case) are **byte-for-byte identical** to
        the old global-`stockHistory` output once merged with the recent sales half,
        sorted by date desc and sliced to 20.
      - **Fresh movement (same machine):** an optimistic write (e.g. `adjustStock` /
        product edit / `transferStock`) prepends to the local list and shows in both
        the Inventory tab and the activity feed **without** a refetch; pressing
        **Refresh** pulls the latest.
      - **No-regression (everything that worked before still works):** given the same
        movement data, both consumers render exactly what they did when reading the
        global slice — the migration changes **what is fetched**, never **what the
        user sees**.
- [ ] No component still destructures `stockHistory` from `useStore()`.
- [ ] App runs; the Inventory Stock History tab loads its rows only on tab open
      (with Show-more), the Dashboard activity feed shows the correct recent stock
      events, and nothing downloads the full `stock_movements` table on mount or poll.
