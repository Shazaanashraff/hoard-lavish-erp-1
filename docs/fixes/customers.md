# Findings — Customers

> Companion to `docs/map/customers.md`. One finding per block. Newest issues at the top of their
> severity tier. When a finding is fixed, move it to the "Resolved" section with the commit sha.

Severity and category legend lives in [README.md](./README.md). Quick reminder:
**P0** data-integrity/broken · **P1** EGRESS (primary goal) · **P2** perf/security · **P3** cleanup/tests.

---

## Open

### CUST-01 · P1 · EGRESS · `services/db/customers.ts:14`
- **Problem:** `fetchCustomers` does `select('*')` on `customers` with **no `limit` and no filter** —
  every client pulls the entire customer table on first load of the Customers screen (and on every
  Refresh / new-day cache miss). Columns are read in full including `created_at`.
- **Impact:** egress grows linearly with the customer base forever; a shop with tens of thousands of
  customers ships the whole table to each terminal daily. Only name/phone/email/points/spent are used.
- **Fix:** project just the mapped columns (`id,name,phone,email,loyalty_points,total_spent`), and add
  server-side search (`ilike` on name/phone) + pagination so the list can load incrementally instead of
  whole-table. The screen already searches client-side, so incremental load needs a search-on-server path.

### CUST-02 · P1 · EGRESS · `components/Customers.tsx:37`
- **Problem:** opening a customer profile calls `fetchSales({ customerId, limit: 200 })`, which uses the
  **heavy** sales select (`*, sale_items(*, products(id,name,sku,size,color,barcode,barcode2))`) — up to
  200 full sales with every line item + joined product rows — to render a table that shows only date,
  invoice #, item names, branch, and amount.
- **Impact:** each profile open can transfer hundreds of KB of nested rows for a five-column summary;
  worst offender for frequently-viewed VIP customers.
- **Fix:** add a summary fetch (project `id, invoice_number, date, branch_name, total_amount` +
  `sale_items(product_name, quantity)`), like `fetchSalesSummary` does for the Dashboard, and use it here.

### CUST-03 · P2 · SECURITY · `components/Customers.tsx:12`
- **Problem:** the add/edit/delete gate is `isCashier` in the **UI only** (`Customers.tsx:121,132`). RLS
  is open (see POS-05), so a cashier's client can still call `insertCustomer`/`updateCustomer`/
  `deleteCustomer` directly — the buttons are hidden, the capability is not revoked.
- **Impact:** role separation for customer data is cosmetic; anyone who can reach the app can mutate the
  customer table. Consistent with the whole app's PIN-phase posture — tracked so it's fixed together.
- **Fix:** enforce role server-side (RLS policy / RPC role check) when the app leaves the open-RLS phase.
  No standalone change until then; do not add a second half-measure client gate.

### CUST-04 · P3 · BUG · `context/StoreContext.tsx:1103`
- **Problem:** `updateCustomer` builds the cache row from `customers.find(c => c.id === id)!` read out of
  the **closure snapshot**, not the freshly-updated state. Two edits to the same customer in the same tick
  (or an edit racing an incoming loyalty update) can write a stale merged row to the local cache.
- **Impact:** rare local-cache drift (server value is still correct); self-heals on next-day refetch.
- **Fix:** derive the cached row inside the `setCustomers` updater (use the `prev` row) instead of the
  closed-over `customers` array.

### CUST-05 · P3 · TEST · `components/Customers.tsx` / `context/StoreContext.tsx:1084`
- **Problem:** only the local-cache helpers are tested (`tests/customers.lazy.test.ts`). The CRUD actions
  (temp-id→UUID swap, optimistic update/delete + offline-queue replay) and the profile purchase-history
  fetch have **no coverage**; nor does the delete → `sales.customer_id` `SET NULL` detach behaviour.
- **Impact:** a regression in the id swap or the queue replay (e.g. duplicate insert on replay) would ship
  silently.
- **Fix:** add tests for `addCustomer` (temp id replaced, single insert on replay), `deleteCustomer`
  (row gone, sales survive), and the profile fetch shape.

---

## Resolved
<!-- - CUST-NN · fixed in <sha> <date> — one line on the fix. -->
