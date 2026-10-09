# Customers

> One-line: the customer database + loyalty screen — list/search customers, add/edit/delete, and open
> a profile that shows lifetime value, loyalty points, last visit, and purchase history.
>
> Status: **DRAFT** · Last verified against code: 2026-07-03 · Commit: 6091b5f

Read this file (and `docs/fixes/customers.md`) before editing the Customers feature. If the code and
this doc disagree, **the code wins** — fix the doc in the same change. Note: loyalty points / total
spent are **not** edited here — they are maintained by the sale/exchange paths (see Business rules).

---

## Key files

| File | Role |
|------|------|
| [components/Customers.tsx](../../components/Customers.tsx) (362 lines) | UI entry point — list + search, add/edit/delete modal, profile view with purchase history. |
| [context/StoreContext.tsx](../../context/StoreContext.tsx) | Actions: `addCustomer`/`updateCustomer`/`deleteCustomer` (optimistic + offline queue), `loadCustomers` (cache-first), `refreshCustomers` (force refetch). |
| [services/db/customers.ts](../../services/db/customers.ts) (55 lines) | DB layer: `fetchCustomers`, `insertCustomer`, `updateCustomer`, `deleteCustomer`, `mapCustomer`. |
| [services/localCustomers.ts](../../services/localCustomers.ts) | Offline mirror: `electron-store` cache (`customers_cache`), day-fresh check (`isCacheFresh`). |
| [supabase/migrations/001_initial_schema.sql:92](../../supabase/migrations/001_initial_schema.sql) | `customers` table; `sales.customer_id` FK is `ON DELETE SET NULL`. |
| [docs/map/sms.md](./sms.md) | **Separate unit** — the SMS campaign screen that lives inside this component. |

## How it works

**Loading the list** (`Customers.tsx:23` → `loadCustomers`, `StoreContext.tsx:1124`): cache-first. If the
`electron-store` cache is fresh (cached today) it hydrates from cache with **no network**; otherwise it
calls `db.fetchCustomers()` — `select('*')` on `customers` ordered by `created_at`, **whole table, no
limit, no branch scope** (customers are global, not branch-scoped). Result is cached with today's date.
The **Refresh** button calls `refreshCustomers` which always refetches and rewrites the cache.

**Search** (`Customers.tsx`) filters the already-loaded array client-side by name / phone / email.

**Selection + SMS** (added with migration 019): each row carries a checkbox (hidden for cashiers) feeding
`selectedIds`, and **Select all** acts on the *filtered* rows. The **SMS** button switches `activeView` to
a third value, `'SMS'`, which renders the Compose / History tabs from `components/sms/`. That feature is
documented separately in [docs/map/sms.md](./sms.md) — this doc only owns the list, the modal and the
profile.

**Add** (`handleSaveCustomer`, `Customers.tsx:47`): requires `name` + `phone` (email optional). Builds a
customer with a throwaway base-36 id and `loyaltyPoints:0`/`totalSpent:0`, then `addCustomer`
(`StoreContext.tsx:1084`) **replaces the id with a real UUID** (`makeUuid`), optimistically pushes to
state + cache, and persists via `executeWithOfflineQueue('ADD_CUSTOMER', …, insertCustomer)`. On success
it swaps the temp row for the server row (which carries the DB-generated UUID).

**Edit** (`updateCustomer`, `StoreContext.tsx:1101`): optimistic `setCustomers` + cache upsert, then
`executeWithOfflineQueue('UPDATE_CUSTOMER', …, db.updateCustomer)`. `db.updateCustomer` only writes the
fields present in the partial (name/phone/email/loyalty_points/total_spent).

**Delete** (`deleteCustomer`, `StoreContext.tsx:1113`): optimistic removal + cache remove, then queued
`db.deleteCustomer` (hard `DELETE`). The `sales.customer_id` FK is `ON DELETE SET NULL`, and each sale
also stores a denormalized `customer_name`, so **historical sales survive** a customer delete — they just
detach from the (now-gone) customer.

**Profile purchase history** (`Customers.tsx:35`): opening a profile fires `fetchSales({ customerId,
limit: 200 })` — this uses the **full** sales select (`*, sale_items(*, products(...))`) even though the
table only renders date / invoice / items / branch / amount. `lastVisit` = date of the most recent row.

## Business rules

- **Who can do what:** `isCashier` (`Customers.tsx:12`) hides **Add / Edit / Delete** — cashiers get a
  read-only list + profile + Refresh. This gate is **UI-only**; RLS is open, so the writes are not
  server-enforced (consistent with the POS PIN-phase posture, POS-05 → CUST-03).
- **Required fields:** Save is blocked unless `name` and `phone` are non-empty; email is optional and
  **not format-validated**. Phone is not validated or deduplicated (two customers can share a number).
- **Loyalty / total spent are NOT set here.** New customers start at 0/0 and the fields are maintained
  elsewhere: `fn_complete_sale` does `total_spent += total`, `loyalty_points += FLOOR(total/10)` on a sale
  (`001_initial_schema.sql:273`); the exchange path adjusts them via `db.updateCustomer`
  (`StoreContext.tsx:1649`); a void reverses them with `GREATEST(0,…)`. The "VIP Customer" badge in the
  profile is **static text**, not a computed tier.
- **Cache lifetime:** the local customer cache is considered fresh for the **calendar day** it was
  written (`isCacheFresh` compares stored date to today). A new day → next `loadCustomers` refetches.

## Actions & Tools

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|
| `loadCustomers` | Cache-first list load (skips network if cached today) | `fetchCustomers` (`select('*')`) or cache |
| `refreshCustomers` | Force refetch + rewrite cache | `fetchCustomers` |
| `addCustomer` | Optimistic add, temp→UUID swap, queued insert | `insertCustomer` → `customers` |
| `updateCustomer` | Optimistic edit, queued update (changed fields only) | `db.updateCustomer` → `customers` |
| `deleteCustomer` | Optimistic remove, queued hard delete | `db.deleteCustomer` (FK `SET NULL` on sales) |
| Profile open | Lazy-load this customer's sales | `fetchSales({customerId, limit:200})` (heavy select — CUST-02) |

## Gotchas (surprising-but-intentional)

- **Customers are global, not branch-scoped.** The list is one table shared across branches; there is no
  `branch_id` on `customers`. Purchase history spans all branches (branch shown per row).
- **Deleting a customer keeps their sales.** `ON DELETE SET NULL` + denormalized `customer_name` means the
  invoice history is intact; the sales just no longer resolve back to a customer record.
- **Loyalty/total-spent edits via this screen are possible but not exposed.** The DB layer accepts them in
  a partial update; the UI never sends them. Don't wire the modal to those fields without deciding who owns
  the number (the sale RPC does today).
- **`smsOptOut` is edited here but consumed by the SMS unit.** The customer modal's "Do not send SMS"
  box writes `customers.sms_opt_out` through the ordinary `updateCustomer` partial; nothing in this screen
  reads it except the "No SMS" badge.
- **The temp id from the modal is thrown away.** `Math.random()` base-36 id in `handleSaveCustomer` exists
  only until `addCustomer` swaps in a real UUID — don't rely on it.

## Tests

| Path | Covered? | Test file |
|------|----------|-----------|
| Local cache helpers (load/save/upsert/remove, day-freshness) | ✅ | `tests/customers.lazy.test.ts` |
| `addCustomer`/`updateCustomer`/`deleteCustomer` optimistic + queue | ❌ | — (CUST-05) |
| Profile purchase-history fetch | ❌ | — (CUST-05) |
| Delete → sales detach (FK SET NULL) behaviour | ❌ | — (CUST-05) |

---

<!-- changelog: append one line per code change that touched this unit -->
- 2026-07-03 6091b5f — initial documentation (DRAFT).
- 2026-09-28 — row selection + `activeView: 'SMS'` + `smsOptOut` on the modal/badges added for the SMS
  campaigns feature (own unit: `docs/map/sms.md`). List/profile behaviour otherwise unchanged.
