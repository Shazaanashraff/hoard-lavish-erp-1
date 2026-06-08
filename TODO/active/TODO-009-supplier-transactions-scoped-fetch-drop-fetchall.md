# TODO-009: Supplier transactions — remove from Accounting + Day-End report, make Suppliers the only consumer (lazy fetch + cache), drop `fetchSupplierTransactions` from the fetch-all

- **ID:** 009
- **Priority:** P1
- **Status:** TODO

## Description

Two coupled changes:

1. **Behavior change (decided):** supplier payments should **no longer affect the
   financial reports**. Today they are subtracted as an expense (reducing net
   profit) in **both** Accounting and the Dashboard Day-End report. Remove that —
   supplier expenses are recorded and viewed **only on the Suppliers page**. Net
   profit in both reports rises by the supplier-payment total. *(Supplier purchases
   are stock buys, not a P&L expense — this is the intended accounting.)*
2. **Egress:** once Accounting and Dashboard stop reading `supplierTransactions`,
   the **Suppliers page is the only consumer** of an **unbounded, ever-growing**
   ledger. So drop `fetchSupplierTransactions` from the fetch-all + realtime, and
   make the Suppliers page fetch its own ledger **lazily on open**, with a cache and
   server-side search + pagination.

`supplierTransactions` is a **company-wide ledger** (the `SupplierTransaction` type
has **no `branchId`**) and each row already carries a denormalized `supplierName`
(no joins). Current consumers — verified by grep:

| Page | What it does with supplier tx today | After this task |
| --- | --- | --- |
| **Accounting** | `filter(PAYMENT + affectsAccounting + period)` → adds `totalSupplierPayments` into `totalExpenses`, the `Inventory/Stock` expense slice, the cashflow chart, and ledger rows | **removed entirely** — no longer reads `supplierTransactions` |
| **Dashboard / Day-End report** | same filter → adds into `totalExpenses`/`netSales`, the unified ledger, the PDF expense rows, and a "Supplier Payments" section | **removed entirely** — no longer reads `supplierTransactions` |
| **Suppliers** | full ledger, client-side text search on `supplierName`/`reference`; CRUD lives here | **sole consumer** — lazy fetch on page open + cache + server-side search/pagination |

Background: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Service (already filter-capable): [services/db/suppliers.ts:82-128](../../services/db/suppliers.ts#L82-L128).

> **Not local storage** (contrast [TODO-008](TODO-008-suppliers-lazy-localfirst-drop-fetchall.md),
> the ≤10-row supplier *master* list). This is an unbounded, ever-growing **ledger**,
> so it gets a scoped/paginated fetch, never a full local cache.

## Part 1 — remove supplier payments from the reports

Strip every `supplierTransactions` reference from these two components. Net profit
= gross − (operating expenses + exchange refunds) afterwards (no supplier term).

**Accounting** ([components/Accounting.tsx](../../components/Accounting.tsx)):
- Remove `supplierTransactions` from the `useStore()` destructure [:11](../../components/Accounting.tsx#L11).
- Remove `filteredSupplierTx` / `totalSupplierPayments` [:55-56](../../components/Accounting.tsx#L55-L56) and drop the `+ totalSupplierPayments` term in `totalExpenses` [:59](../../components/Accounting.tsx#L59).
- Remove the cashflow `filteredSupplierTx.forEach(...)` [:78](../../components/Accounting.tsx#L78) and the `Inventory/Stock` slice in `expenseBreakdown` [:95-96](../../components/Accounting.tsx#L95-L96).
- Remove the supplier ledger rows [:140-141](../../components/Accounting.tsx#L140-L141) and the `Stock: LKR …` figure in the summary line [:238](../../components/Accounting.tsx#L238).
- Clean the now-stale `useMemo` deps that referenced `filteredSupplierTx`/`totalSupplierPayments`.

**Dashboard / Day-End report** ([components/Dashboard/index.tsx](../../components/Dashboard/index.tsx)):
- Remove `supplierTransactions` from the `useStore()` destructure [:19](../../components/Dashboard/index.tsx#L19).
- Remove the `filteredSupplierTx` memo [:140-143](../../components/Dashboard/index.tsx#L140-L143) and its unified-ledger rows [:158-160](../../components/Dashboard/index.tsx#L158-L160).
- Remove `totalSupplierPayments` and drop the `+ totalSupplierPayments` term in `totalExpenses` [:301-302](../../components/Dashboard/index.tsx#L301-L302).
- Remove the PDF supplier expense rows [:396-398](../../components/Dashboard/index.tsx#L396-L398) and the on-report "Supplier Payments" section [:881-916](../../components/Dashboard/index.tsx#L881-L916); update the empty-state condition [:916](../../components/Dashboard/index.tsx#L916) to drop `filteredSupplierTx.length`.
- Clean the now-stale `useMemo` deps.

## Part 2 — Suppliers page becomes the sole, self-loading consumer

- **Service** (`services/db/suppliers.ts`): extend `FetchSupplierTransactionsOptions`
  with **`search`** (server-side `.or('supplier_name.ilike.%q%,reference.ilike.%q%')`),
  **`limit`**, **`offset`**. Keep the existing `affects_accounting` column fallback
  intact. Don't change current call sites' behavior.
- **Suppliers page** ([components/Suppliers.tsx](../../components/Suppliers.tsx)):
  lazy-fetch the ledger on page open (not in the global fetch-all); move the text
  search server-side (`search`) and paginate (`limit` + **Show more** via `offset`);
  add a **Refresh** button. Keep the CRUD handlers, now updating the page's own list
  optimistically.
- **Fetch-all wiring to remove:**
  - `loadAll` — `db.fetchSupplierTransactions()` [StoreContext.tsx:493](../../context/StoreContext.tsx#L493) → `setSupplierTransactions(...)` [:536](../../context/StoreContext.tsx#L536).
  - `refreshFromSupabase` — `db.fetchSupplierTransactions()` [:585](../../context/StoreContext.tsx#L585) → `setSupplierTransactions(...)` [:603](../../context/StoreContext.tsx#L603).
  - Realtime `supplier_transactions` [:660](../../context/StoreContext.tsx#L660) must **no longer** trigger the full `refreshFromSupabase`.
  - **Optimistic writers stay** (same-machine fresh path): `recordSupplierExpense` [:1706](../../context/StoreContext.tsx#L1706)/[:1774](../../context/StoreContext.tsx#L1774), `updateSupplierTransaction` [:1779](../../context/StoreContext.tsx#L1779), `deleteSupplierTransaction` [:1789](../../context/StoreContext.tsx#L1789). Cross-device → **Refresh**.
  - The global `supplierTransactions` slice in `StoreContext` may be retired or kept only as the Suppliers page's local state — pick whichever is cleaner given the page is the only reader.

## Files likely involved

- `components/Accounting.tsx` — remove all supplier-tx usage (Part 1)
- `components/Dashboard/index.tsx` — remove all supplier-tx usage incl. Day-End report (Part 1)
- `services/db/suppliers.ts` — add `search` / `limit` / `offset` to `FetchSupplierTransactionsOptions`
- `components/Suppliers.tsx` — lazy + server-side search + paginated ledger (Part 2)
- `context/StoreContext.tsx` — remove `fetchSupplierTransactions` from `loadAll` + `refreshFromSupabase`, stop the `supplier_transactions` realtime full-refetch, keep optimistic writers
- `tests/` — new completion test (colocated, mirrors `utils/revenue.test.ts`)

## Acceptance criteria

- [ ] **Completion verification test** (this task only — `npx vitest run <this-test-file>`,
      not the whole suite; `NODE_ENV=test`; mock `db`/realtime). It must prove:

      **Part 1 — reports exclude supplier payments (intended change):**
      - For a dataset with supplier `PAYMENT`s in the period, **Accounting**
        `totalExpenses` / net and the `expenseBreakdown` contain **no** supplier
        (`Inventory/Stock`) contribution, and the cashflow + ledger have no
        `Supplier: …` rows.
      - The **Day-End report** `totalExpenses` / `netSales` exclude supplier
        payments, the PDF expense rows omit supplier lines, and there is **no**
        "Supplier Payments" section.
      - Concretely: net profit = gross − (operating + refunds) with **zero**
        supplier term — assert it equals the old value **plus** the supplier-payment
        total (i.e. the change is exactly the removed amount, nothing else moved).
      - Neither component destructures `supplierTransactions` from `useStore()`.

      **Part 2 — Suppliers-only scoped fetch (egress + page parity):**
      - **No global load:** after `loadAll`, after `refreshFromSupabase`, and after a
        `supplier_transactions` realtime event, `fetchSupplierTransactions` is **not**
        called for a full/unbounded pull and the global slice is **not** bulk-populated.
      - **Lazy + parity:** opening the Suppliers page fetches the ledger
        (scoped/paginated), not before; a `search` returns the **same** rows the old
        client-side `supplierName`/`reference` text filter produced; **Show more**
        appends the next `offset` page.
      - **Fresh write (same machine):** `recordSupplierExpense` /
        `updateSupplierTransaction` / `deleteSupplierTransaction` update the Suppliers
        page list optimistically without a refetch; **Refresh** pulls latest.
- [ ] App runs; Accounting and the Day-End report no longer show or subtract supplier
      payments (net profit higher by exactly that amount), the Suppliers page still
      lists/searches/paginates its transactions server-side, and nothing downloads the
      full `supplier_transactions` table on mount or poll.
