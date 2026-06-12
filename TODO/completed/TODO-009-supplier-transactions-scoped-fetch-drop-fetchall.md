# TODO-009: Supplier transactions — remove from Accounting + Day-End report, make Suppliers the only consumer (lazy fetch + cache), drop `fetchSupplierTransactions` from the fetch-all

- **ID:** 009
- **Priority:** P1
- **Status:** completed

## Description

Two coupled changes:

1. **Behavior change (decided):** supplier payments should **no longer affect the
   financial reports**. Today they are subtracted as an expense (reducing net
   profit) in **both** Accounting and the Dashboard Day-End report. Remove that —
   supplier expenses are recorded and viewed **only on the Suppliers page**. Net
   profit in both reports rises by the supplier-payment total.
2. **Egress:** once Accounting and Dashboard stop reading `supplierTransactions`,
   the **Suppliers page is the only consumer** of an **unbounded, ever-growing**
   ledger. So drop `fetchSupplierTransactions` from the fetch-all + realtime, and
   make the Suppliers page fetch its own ledger **lazily on open**, with a cache and
   server-side search + pagination.

Implemented on branch: TODO/supplier-transactions-scoped-fetch-drop-fetchall
