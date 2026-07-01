# Findings — POS / Checkout

> Companion to `docs/map/pos.md`. Severity: **P0** data-integrity · **P1** EGRESS (primary goal) ·
> **P2** perf/security · **P3** cleanup/tests. Verified against commit 6091b5f on 2026-06-30.

---

## Open

### POS-01 · P0 · ATOMICITY · `context/StoreContext.tsx:1582-1630`, `services/db/sales.ts:214-269`
- **Problem:** Exchange persistence is a multi-step client sequence with **no transaction**: N×
  `upsertBranchStock`, N× `insertStockMovement`, optional `updateCustomer`, then `insertExchange`
  (itself **two** separate inserts — header, then `exchange_items`), then an optional direct
  `sales` DELETE of the original. Sales, by contrast, are fully atomic inside `fn_complete_sale`.
- **Impact:** Any partial failure (crash, network drop mid-loop, items-insert error, delete error)
  leaves the DB inconsistent: stock adjusted but no exchange row; an exchange header with zero items;
  or the original sale deleted while the exchange failed to record. Silent stock / loyalty / revenue
  corruption. The same non-atomic shape runs again on offline replay (`StoreContext.tsx:303-328`).
- **Fix:** Move the whole exchange into one `fn_complete_exchange(...)` plpgsql RPC (stock deltas +
  movements + customer adjust + exchange header/items + optional sale void), mirroring
  `fn_complete_sale`. Have `completeExchange` call that single RPC instead of orchestrating writes.

### POS-02 · P0 · BUG · `context/StoreContext.tsx:1353-1358`, `supabase/migrations/011_sale_item_variant_snapshots.sql:29`
- **Problem:** `updateSale` persists an edit by calling `completeSaleRPC(updatedSale)` with the
  **original** `invoiceNumber`. But `fn_complete_sale` is **INSERT-only** and `sales.invoice_number`
  is `UNIQUE NOT NULL` (`001_initial_schema.sql:107`). Re-inserting the same invoice number raises a
  unique-violation (23505). The inline comment *"Reuse the same RPC (it will update if exists)"* is
  false — there is no update path anywhere.
- **Impact:** Editing an already-synced sale fails server-side (the error is a DB error, not a
  connectivity one, so it is **not** queued) while the optimistic local state shows the edit applied.
  Local and server diverge; on the next load the edit silently vanishes and stock/loyalty deltas the
  user saw are lost. (UI trigger is in Dashboard `Dashboard/index.tsx:725`, but the defect is in this
  unit's sales RPC contract.)
- **Fix:** Add a real update path — an atomic `fn_update_sale` (delete + re-insert items, re-apply the
  net stock delta, adjust loyalty) or make `fn_complete_sale` upsert on `invoice_number`. Until then,
  disable editing of sales that already exist on the server.

### POS-06 · P0 · BUG · `supabase/migrations/011_sale_item_variant_snapshots.sql:131-134`
- **Problem:** `fn_complete_sale` decrements stock with `GREATEST(0, quantity - qty)` and performs **no
  availability check**. Overselling is blocked only in the UI (`addToCart`, scan guards). So (a) two
  terminals selling the same last unit both succeed and stock floors at 0 (true oversell hidden); and
  (b) offline-queue replay re-applies a sale that may now exceed current stock, again flooring at 0.
- **Impact:** Overselling is **not allowed** (confirmed intent), yet the server permits it: branch stock
  silently floors at 0, masking real shortfall, and concurrent last-unit races go undetected — corrupt
  inventory truth. Data-integrity, hence P0.
- **Fix:** Add an availability check inside `fn_complete_sale` that raises (e.g. `RAISE EXCEPTION 'Insufficient
  stock'`) when `product_branch_stock.quantity < requested` for the branch, before the decrement — so the
  whole atomic sale rolls back rather than flooring. The UI cap stays as a first line of defense.

### POS-09 · P0 · BUG · `supabase/migrations/009_void_sale.sql:63-65`, `context/StoreContext.tsx:1627`
- **Problem:** Voiding a sale permanently **`DELETE`s** it: `fn_void_sale` ends in `DELETE FROM sales`
  (cascading to `sale_items`), and the full-return exchange path issues a direct
  `supabase.from('sales').delete()` (`StoreContext.tsx:1627`). There is no status column and no retained
  record of the voided/returned sale.
- **Impact:** The intended behavior (confirmed) is a **soft-void that retains the sale for audit**. Current
  code instead destroys the financial record and its line items — permanent loss of audit/revenue history.
  Data-retention/integrity gap.
- **Fix:** Add a `status` (e.g. `ACTIVE` | `VOIDED` | `RETURNED`) + `voided_at`/`void_reason` column to
  `sales`. Change `fn_void_sale` to restore stock + reverse loyalty + **mark** the row voided instead of
  deleting. Update the exchange full-return path to mark rather than delete. Filter active-only sales in the
  read paths (`fetchSales`, daily totals) so reports exclude voided rows. (Ties into POS-01's exchange RPC.)

### POS-03 · P2 · EGRESS · `context/StoreContext.tsx:1363-1369`
- **Problem:** `deleteSale` (void) calls `refreshFromSupabase()` after `voidSaleRPC`, re-fetching the
  full product catalog (`fetchProductsWithStock`) and other datasets. It is the only sales-lifecycle
  action that triggers a full refetch (sale and exchange paths are optimistic).
- **Impact:** Full product-catalog egress per void. Low frequency (voids are rare), hence P2 not P1,
  but it is avoidable cost.
- **Fix:** Apply the void optimistically (restore stock locally, as the local-only branch at
  `:1372-1413` already does) and drop the global refetch, or scope the refetch to the affected products.

### POS-04 · P2 · EGRESS · `context/StoreContext.tsx:800-813`, `services/db/sales.ts:200-212`
- **Problem:** The realtime subscription fires `onExchangeEvent` on every `exchanges`/`exchange_items`
  change, and that handler refetches the rolling 2-week exchange window
  (`fetchExchanges({dateFrom: twoWeeksAgo})` selecting `*, exchange_items(*)`). With N connected
  clients, one exchange triggers N two-week refetches.
- **Impact:** Exchange egress scales with client count on every exchange. (Sales were deliberately
  excluded from realtime for this reason; exchanges still pay it.)
- **Fix:** Apply the realtime payload incrementally (upsert the single changed exchange) rather than
  refetching the window; or debounce and scope to the changed row.

### POS-05 · P2 · SECURITY · `supabase/migrations/001_initial_schema.sql:286-317`, `services/supabaseClient.ts`
- **Problem:** RLS is enabled but every table has a `"Allow all" USING(true) WITH CHECK(true)` policy,
  and the desktop client ships the **anon** key. There is effectively no server-side authorization:
  anyone with the anon key (it is in the bundle / `.env`) can read/write/delete every table — customer
  PII, sales, pricing, and `users` (which stores `pin` as plaintext, `001:32`).
- **Impact:** Full data exposure and tampering if the key leaks. This is a **known, intentional**
  "PIN-auth phase" decision per the migration comment — documented posture, not a regression — but it
  means privileged actions (void, user management) have no real access control.
- **Fix:** When moving past the PIN phase, adopt Supabase Auth + per-role policies; at minimum, put
  privileged ops behind authenticated RPCs and stop storing PINs in plaintext. (Cross-ref: Auth unit.)

### POS-07 · P3 · BUG · `context/StoreContext.tsx:1186`
- **Problem:** `completeSale` assigns the local `SalesRecord` a throwaway id
  (`Math.random().toString(36)`) and never reconciles it with the UUID returned by `fn_complete_sale`.
  Sales are excluded from realtime/refetch, so the non-UUID id can persist for the whole session.
- **Impact:** Any same-session action that keys on that id against the server (e.g. voiding/editing the
  just-made sale before a reload) would send a non-UUID to an RPC expecting `p_sale_id UUID` and fail.
  Low reach today (void/edit UI lives in Dashboard, which loads server rows with real UUIDs).
- **Fix:** Set `newSale.id` from the RPC's returned UUID in `completeSale`'s success path (the RPC
  already `RETURN`s it; `completeSaleRPC` returns `data as string`).

### POS-08 · P3 · TEST · `components/POS/`, `context/StoreContext.tsx`, `components/POS/posUtils.ts`
- **Problem:** No test covers the core write paths — `completeSale` (checkout), `completeExchange`,
  the Cash+Card split validation — or the money math in `posUtils.ts` (`round2`,
  `allocateDiscountByUnits`, `getEffectiveLineTotal`). Existing tests cover daily totals, lazy fetch,
  and the offline queue, but not these.
- **Impact:** Regressions in checkout totals, discount allocation, or exchange pricing ship silently.
- **Fix:** Add unit tests for `posUtils` money math and an integration test for `completeSale`
  (mock `db`) asserting the RPC payload and the optimistic state mutation; same for `completeExchange`.

---

## Resolved
<!-- none yet -->
