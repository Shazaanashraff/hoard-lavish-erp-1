# POS / Checkout

> One-line: the point-of-sale screen — scan/search products into a cart, apply discounts, take
> payment (Cash / Card / Digital / Cash+Card), record the sale, and run product exchanges/returns.
>
> Status: **LOCKED** · Last verified against code: 2026-07-16

Read this file (and `docs/fixes/pos.md`) before editing the POS feature. If the code and this doc
disagree, **the code wins** — fix the doc in the same change. Sale **edit/void** UI lives in the
Dashboard unit, not here, but it reuses this unit's sales RPCs (see Actions).

---

## Key files

| File | Role |
|------|------|
| [components/POS/index.tsx](../../components/POS/index.tsx) (2043 lines) | UI entry point — cart, barcode scanner, search, discounts, checkout, exchange flow, receipt printing. |
| [components/POS/posUtils.ts](../../components/POS/posUtils.ts) | Pure money math: `round2`, `allocateDiscountByUnits`, `getEffectiveLineTotal` (exchange line pricing). |
| [context/StoreContext.tsx](../../context/StoreContext.tsx) | The actions: `addToCart`/`updateCartQuantity` (stock caps), `completeSale`, `updateSale`, `deleteSale`, `completeExchange`, `executeWithOfflineQueue`, offline replay. |
| [services/db/sales.ts](../../services/db/sales.ts) | DB layer: `completeSaleRPC`, `voidSaleRPC`, `insertExchange`, `fetchSales`, `fetchExchanges`, mappers. |
| [services/db/stockMovements.ts](../../services/db/stockMovements.ts) | `insertStockMovement`, `upsertBranchStock` (used by the exchange path). |
| [supabase/migrations/011_sale_item_variant_snapshots.sql](../../supabase/migrations/011_sale_item_variant_snapshots.sql) | **Current** `fn_complete_sale` RPC body (the atomic sale write). |
| [supabase/migrations/009_void_sale.sql](../../supabase/migrations/009_void_sale.sql) | `fn_void_sale` RPC (atomic void: restore stock, reverse loyalty, delete). |
| [supabase/migrations/008_cash_card_split_payments.sql](../../supabase/migrations/008_cash_card_split_payments.sql) | Cash+Card split: `cash_amount`/`card_amount` columns + RPC split validation. |
| [supabase/migrations/010_exchange_persistence.sql](../../supabase/migrations/010_exchange_persistence.sql) | `exchanges` + `exchange_items` tables. **No exchange RPC** — exchange writes are client-side (see Gotchas). |
| [supabase/migrations/001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql) | Base schema: `sales`, `sale_items`, `product_branch_stock`, RLS policies. |

## How it works

**A normal sale (online):**
1. Products enter the cart via barcode scan, SKU/search, or grid click. `addToCart` (`StoreContext.tsx:1105`)
   refuses to add a unit if `cartQty + 1 > branchStock[currentBranch]` → returns `Insufficient stock…`.
   The UI also rejects scanning a 0-stock item ("Product out of stock in this branch").
2. Discounts: per-line (`handleItemDiscountChange`) and a bill-level discount (`handleBillDiscountChange`),
   each capped so the price can't go negative; a **warning only** (not a block) fires if a discounted
   price drops below cost. Totals come from `calculateCartTotals` (`utils/cart.ts`).
3. `handleCheckout` (`POS/index.tsx:614`) validates a Cash+Card split (both ≥ 0, cash+card = total ±0.01)
   then calls `completeSale(paymentMethod, totalDiscount, customerId?, {cashAmount,cardAmount}?)`.
4. `completeSale` (`StoreContext.tsx:1171`) builds the `SalesRecord`, **optimistically** updates local state
   (decrement branch stock, push `OUT` stock movements, bump customer `totalSpent`/`loyaltyPoints`, prepend
   to `salesHistory`, clear cart), then fires `executeWithOfflineQueue('COMPLETE_SALE', …, () => completeSaleRPC(sale))`.
   **No refetch follows** — the optimistic state is the source of truth until the next load (good for egress).
5. `completeSaleRPC` (`sales.ts:5`) calls `fn_complete_sale`. **The RPC does, atomically in one Postgres
   function:** insert the `sales` row (computing `cash_amount`/`card_amount` from payment method), loop the
   items to insert `sale_items` (with sku/size/color/barcode variant snapshots), decrement
   `product_branch_stock` via `GREATEST(0, quantity - qty)`, insert an `OUT` `stock_movements` row per item,
   and — if a customer is attached — `total_spent += total`, `loyalty_points += FLOOR(total/10)`.
6. If the call hits a connectivity error (or `navigator.onLine === false`), the operation is enqueued and
   replayed later via the same `completeSaleRPC` (`StoreContext.tsx:296`).

**Exchange / return** (`completeExchange`, `StoreContext.tsx:1419`): builds an `ExchangeRecord` with
`returnedItems` (RETURN) and `newItems` (NEW). Guard: cumulative returns per original sale line can't exceed
that line's sold quantity across prior exchanges. It **optimistically** restocks returned items (`IN`), deducts
new items (`OUT`), adjusts customer spend/loyalty by `newTotal − returnedTotal`, then persists via
`executeWithOfflineQueue('COMPLETE_EXCHANGE', …)` which runs a **client-side sequence**: per-product
`upsertBranchStock`, per-movement `insertStockMovement`, optional `updateCustomer`, then
`insertExchange` (header + items as two inserts). **The original sale row is always kept** (full and
partial returns behave identically) — `original_sale_id` stays linked, and the sale's own
`totalAmount` plus the exchange's `difference` are what net out to the correct revenue in the
Dashboard/Day-End Report (`sales + exchanges.difference`); deleting the sale would silently drop its
amount from every revenue total (fixed 2026-07-16, see fixes POS-09 update).

## Business rules

- **Who can do what:** **No role/permission gating — intentional (PIN-auth phase, confirmed).** `currentUser`
  is read only for the receipt's cashier name (`POS/index.tsx:707`). Any logged-in user may sell, exchange,
  and (from Dashboard) edit/void. There is also no enforced sale-edit time window (the "10-minute" mentioned in
  the `updateSale` comment is not implemented). Server-side this matches the open RLS posture (fixes POS-05).
- **Stock limits:** the cart cannot exceed current branch stock (`addToCart`, `updateCartQuantity`).
  **Overselling is not allowed (confirmed intent)** — stock must never floor at a wrong value. The UI enforces
  this, but the **RPC does not yet** (`GREATEST(0, …)`, no availability check), so concurrent terminals / offline
  replay can still oversell. That gap is a bug, not a rule — see fixes **POS-06**.
- **Loyalty (proven in RPC):** `loyalty_points += FLOOR(total/10)` and `total_spent += total` on sale;
  reversed with `GREATEST(0, …)` on void; on exchange, delta = `FLOOR(newTotal/10) − FLOOR(returnedTotal/10)`.
- **Cash+Card split (proven in RPC + UI):** both amounts ≥ 0 and `cash + card = total` within 0.01, else reject.
  RPC also derives `cash_amount`/`card_amount` for pure Cash (all cash) and pure Card (all card).
- **Exchange return cap (proven):** per original sale line, `requested ≤ soldQty − alreadyReturned` across the
  branch's prior exchanges; otherwise it throws before persisting.
- **Sale status lifecycle:** **Intended (confirmed): sales should be *soft-voided* with a status flag and kept
  for audit.** **Current code does NOT do this for the Dashboard Void button** — `sales` rows have no status
  column and Void is a hard `DELETE`: `fn_void_sale` (restore stock, reverse loyalty, then `DELETE`). This
  divergence from intent is a data-retention gap — see fixes **POS-09**. A full-return/exchange, by contrast,
  **no longer deletes** the original sale (fixed 2026-07-16) — it stays in `sales` with its `original_sale_id`
  FK intact, and the Dashboard hides Edit/Void for it once every line has been returned (see `docs/map/dashboard.md`).

## Actions & Tools

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|
| `addToCart` / `updateCartQuantity` | Cart edits, capped at branch stock | local state only |
| `completeSale` | Record a sale (optimistic + RPC) | `fn_complete_sale` → `sales`, `sale_items`, `product_branch_stock`, `stock_movements`, `customers` |
| `completeExchange` | Record a return/exchange (original sale is kept) | `upsertBranchStock`, `insertStockMovement`, `updateCustomer`, `insertExchange` (→ `exchanges`,`exchange_items`) |
| `updateSale` *(UI in Dashboard)* | Edit a recent sale | `completeSaleRPC` again — **INSERT-only, breaks on UNIQUE invoice** (see fixes POS-02) |
| `deleteSale` *(UI in Dashboard)* | Void a sale | `fn_void_sale`, then `refreshFromSupabase()` (full refetch) |
| `printReceiptForSale` / `…Exchange` | Thermal/A4 receipt | `window.electronAPI.printReceipt` (Electron), `utils/receiptHtml.ts` |
| Barcode scanner | Global HID keydown listener buffers keystrokes → product lookup | local state |
| `executeWithOfflineQueue` | Wrap a write: run online, else enqueue to `localStorage` and replay | offline queue |

## Gotchas (surprising-but-intentional)

- **Sales are NOT in realtime; exchanges ARE.** The realtime subscription (`StoreContext.tsx:800-813`)
  deliberately excludes `sales`/`sale_items` (lazy-fetched per page) but subscribes to `exchanges`/
  `exchange_items`. Every exchange therefore triggers a 2-week exchange refetch on **all** clients (egress —
  see fixes POS-04).
- **No refetch after a sale, by design.** `completeSale` trusts its optimistic local update. Don't "fix" it by
  adding a `refreshFromSupabase()` — that re-introduces full-catalog egress.
- **Exchange persistence has no RPC.** Unlike sales, the whole exchange write is client-orchestrated and
  **not atomic** (fixes POS-01). `architecture.md` says exchanges "adjust stock on both sides" — true, but it
  happens in `completeExchange`/the offline replay, **not** in `insertExchange` (which only writes the rows).
- **Full-return keeps the original sale (fixed 2026-07-16).** Earlier code hard-deleted the sale when every
  line of the invoice was returned/exchanged, which silently dropped its amount from every revenue total
  (Dashboard KPIs, Day-End Report, ledger) — the exchange's `difference` alone was left counted, understating
  or overstating revenue by the deleted sale's amount. Now every exchange (full or partial) keeps the sale row
  and its `original_sale_id` FK, so `sales + exchanges.difference` nets out correctly and both legs show as
  separate transactions in reports.
- **Legacy DB fallback in `completeSaleRPC`** retries `fn_complete_sale` without the split params if the server
  is on a pre-008 signature; Cash+Card on such a DB throws a clear "apply migration 008" error.
- **`fn_complete_sale` is INSERT-only.** It never updates — so reusing it to "edit" a sale is a bug (POS-02),
  despite the inline comment claiming otherwise.

## Tests

| Path | Covered? | Test file |
|------|----------|-----------|
| Sales daily totals RPC mapping | ✅ | `services/db/sales.dailyTotals.test.ts` |
| Exchanges lazy fetch / scoping | ✅ | `tests/localExchanges.test.ts`, `tests/todo-009-exchanges-lazy-scoped.test.ts` |
| Offline queue replay | ✅ (general) | `tests/offline-queue.test.ts` |
| `completeSale` / checkout flow | ❌ | — (fixes POS-08) |
| `completeExchange` flow | ❌ | — (fixes POS-08) |
| `posUtils` money math (`round2`, `allocateDiscountByUnits`, `getEffectiveLineTotal`) | ❌ | — (fixes POS-08) |
| Cash+Card split validation | ❌ | — (fixes POS-08) |

---

<!-- changelog: append one line per code change that touched this unit -->
- 2026-06-30 6091b5f — initial documentation (reference unit).
- 2026-07-16 — full-return/exchange no longer hard-deletes the original sale; fixes revenue
  double-loss on the Dashboard/Day-End Report (POS-09 exchange sub-case resolved).
