# Findings — Inventory

> Companion to `docs/map/inventory.md`. Severity: **P0** data-integrity · **P1** EGRESS (primary goal) ·
> **P2** perf/security · **P3** cleanup/tests. Verified against commit 6091b5f on 2026-06-30.

---

## Open

### INV-02 · P0 · BUG · `services/db/products.ts:142-148`, `context/StoreContext.tsx:1010`
- **Problem:** `deleteProduct` mode `DELETE_LINKED_SALES` runs `DELETE FROM sales WHERE id IN (linked)`
  (cascading to `sale_items`) so the product can then be deleted. It does **not** reverse the customer
  loyalty/`total_spent` those sales granted, nor restore/limit stock, and it permanently removes the
  revenue history. Exposed in the UI as the third delete option (`Inventory/index.tsx:303`).
- **Impact:** Deleting a product can silently wipe completed sales (revenue/audit) and leave customer
  loyalty + spend overstated forever. Directly contradicts the confirmed soft-void/audit-retention
  intent (see POS-09). Even if "delete linked sales" stays a deliberate power action, the unreversed
  loyalty/stock is silent integrity drift.
- **Fix:** Remove `DELETE_LINKED_SALES`, or route it through the (planned) soft-void path so sales are
  marked voided (stock restored, loyalty reversed) rather than hard-deleted. At minimum, reverse
  loyalty/spend and log the deletion.

### INV-03 · P1 · EGRESS · `services/db/products.ts:24-44`, `context/StoreContext.tsx` (`refreshFromSupabase`)
- **Problem:** `fetchProductsWithStock` loads **every** `products` row plus **every**
  `product_branch_stock` row on each app start and each `refreshFromSupabase()`. It projects columns
  (good) but is otherwise unbounded — it grows with catalog × branches. `deleteProduct`, reconnect,
  the debounced realtime handler, and manual refresh all trigger a full refetch.
- **Impact:** This is the single largest recurring Supabase egress in the app (the concern behind
  `docs/optimisation/CENTRAL_FETCHING.md`). Every single-product mutation that calls
  `refreshFromSupabase()` re-downloads the whole catalog.
- **Fix:** Stop full-refetching after single-row mutations (apply optimistically, as the sale path
  does). Paginate/scope the catalog load, or incrementally reconcile via realtime payloads instead of
  re-pulling everything.

### INV-04 · P2 · ATOMICITY · `context/StoreContext.tsx:1682`, `services/db/stockMovements.ts:84-90`
- **Problem:** All client stock writes use `upsertBranchStock(productId, branchId, ABSOLUTE)` computed
  from a value the client read earlier (`adjustStock`, `transferStock`, `addDamagedGood`/delete, the
  POS exchange path). Two terminals adjusting the same product/branch concurrently each write their own
  absolute value → last write wins, silently dropping the other's delta. Offline replay is worse: it
  writes an absolute value computed when the operation was first queued.
- **Impact:** Stock drift under concurrency or offline replay — undetected and unlogged at the data
  layer. Sales avoid this because `fn_complete_sale` does a relative `quantity - qty` atomically in SQL.
- **Fix:** Apply stock changes as **relative** increments in the DB (an
  `fn_adjust_branch_stock(product, branch, delta)` RPC, or a trigger), never an absolute set from a
  stale read. This is the systemic version of POS-06.

### INV-01 · P2 · BUG · `services/db/inventory.ts:52-74`, `context/StoreContext.tsx:2082-2095`
- **Problem:** `db.insertDamagedGood` already decrements branch stock and inserts an `OUT` `Damaged`
  movement. But `addDamagedGood` *also* passes a `stockRow`/`stockMovement` and the offline-queue fn
  then calls `upsertBranchStock(...)` + `insertStockMovement(...)` again. Net: **two** `OUT` movements
  per damaged event and two competing absolute stock writes (the caller's wins). `deleteDamagedGood`
  has the mirror double-write (two `IN` movements). The offline replay path (`StoreContext.tsx:402-423`)
  repeats it.
- **Impact:** The stock-movement ledger double-counts every damaged-goods event, inflating any
  movement-based report/audit. The stock *balance* usually stays correct (both writes target ~the same
  value) but diverges to the client's value if server/client stock disagreed.
- **Fix:** Make stock mutation single-owner — either keep it inside `db.insertDamagedGood`/
  `deleteDamagedGood` and stop applying `stockRow`/`stockMovement` in the caller + replay, or strip the
  stock logic out of the service and keep it only in the caller. Pick one.

### INV-05 · P2 · ATOMICITY · `context/StoreContext.tsx:1694-1798`, `services/db/products.ts:46-78`
- **Problem:** `transferStock` is a multi-step client write (N× `upsertBranchStock` for source +
  destination, N× `insertStockMovement`, then `insertStockTransfer`) with no transaction; its rollback
  only covers permission errors, not a partial DB failure mid-sequence. `insertProduct` is a 2-step
  write (product, then stock rows) with a manual compensating delete that can itself fail.
- **Impact:** A partial failure can move stock out of the source without crediting the destination (or
  vice versa), or leave an orphan product with no stock rows / a stock-less product.
- **Fix:** Wrap each in a single RPC (`fn_transfer_stock`, `fn_insert_product`) so the multi-row write
  is atomic.

### INV-06 · P2 · SECURITY · `components/Inventory/index.tsx:37,698-713,811`
- **Problem:** The `isCashier` role gate only hides UI affordances (add/edit/delete/transfer/categories).
  The underlying `StoreContext` actions perform no role check, and RLS is `"Allow all"` on the anon key.
- **Impact:** A CASHIER (or anyone holding the anon key) can mutate the catalog and stock by invoking
  the actions directly — the restriction is cosmetic. (Cross-ref POS-05.)
- **Fix:** Enforce the role server-side (authenticated RPCs / RLS) once Supabase Auth replaces PIN auth.

### INV-07 · P3 · CONSISTENCY · `services/db/inventory.ts:123-143`, `supabase/migrations/002_inventory_and_damaged_goods.sql:31-43`
- **Problem:** `damaged_goods` has no unique constraint, so `deleteDamagedGoodByRecord` identifies rows
  by matching all columns and loops over every match — ambiguous identity if two identical write-offs
  exist. Optimistic records also use a non-UUID id, gated by `shouldDeleteRemote = isUuid(id)`.
- **Impact:** Edge-case over-restore or mismatched deletes when duplicate damaged-goods rows exist.
- **Fix:** Delete by `id` only (the UI has it); reconcile optimistic ids to server UUIDs after insert.

### INV-08 · P3 · TEST · `components/Inventory/`, `context/StoreContext.tsx`, `services/db/products.ts`
- **Problem:** No tests cover `adjustStock`/`transferStock` math, damaged-goods stock effects,
  variation product creation, or the three `deleteProduct` modes. Existing tests cover local product
  cache and lazy stock-movement scoping only.
- **Impact:** Regressions in stock math, variation generation, or delete-mode behavior ship silently.
- **Fix:** Add unit tests for the stock-mutation actions (mock `db`) and the `deleteProduct` modes.

---

## Resolved
<!-- none yet -->
