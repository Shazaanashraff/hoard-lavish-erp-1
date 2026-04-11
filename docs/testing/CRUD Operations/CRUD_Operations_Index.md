# Hoard Lavish ERP - Complete CRUD Operations Index

Date: 2026-04-11  
Owner: QA Documentation  
Scope: Full CRUD inventory for runtime pages, service layer, offline/local persistence, and recovery/migration appendix

## 1. Purpose

This document is the master inventory of all CRUD operations in the ERP.

It is designed for two audiences:
- Senior QA engineers: full traceability from UI trigger to persistence layer.
- Interns: plain-language mapping of what each operation does and where it runs.

This is documentation only. No tests are executed by this document.

## 2. Source Of Truth Used

Primary runtime sources:
- [App.tsx](../../App.tsx)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [services/supabaseService.ts](../../services/supabaseService.ts)
- [services/supabaseClient.ts](../../services/supabaseClient.ts)
- [types.ts](../../types.ts)
- [components/](../../components)

Recovery and manual SQL sources:
- [scripts/offline-sales-recovery.js](../../scripts/offline-sales-recovery.js)
- [scripts/supplier-expense-recovery.js](../../scripts/supplier-expense-recovery.js)
- [scripts/recover-supplier-expense-2026-04-06.sql](../../scripts/recover-supplier-expense-2026-04-06.sql)
- [supabase/migrations](../../supabase/migrations)

## 3. Coverage Summary

- Routed pages covered: Dashboard, POS, Inventory, Customers, Suppliers, Accounting, Sales History, Branches, Settings, Offline Queue.
- Service-layer persistent operations covered: 49.
- Offline operation types covered from types.ts OfflineOperationType: 33/33.
- Local persistence operations covered: offline queue + local cache + transfer/exchange fallback keys.
- Recovery/migration appendix included: yes.

## 4. Page-Level CRUD Matrix

Legend:
- C = Create
- R = Read
- U = Update
- D = Delete
- L = Local state/localStorage only

| Page/Module | Create | Read | Update | Delete | Main Operation IDs |
|---|---|---|---|---|---|
| Dashboard | - | R | U | D | SA-R1, SA-U1, SA-D1 |
| POS | C | R | U | D | CU-C1, SA-C1, EX-C1, CART-C1, CART-U1, CART-U2, CART-D1, CART-D2 |
| Inventory | C | R | U | D | PR-C1, PR-R1, PR-U1, PR-D1/D2/D3, SM-C1, TR-C1, TR-R1, CA-C1/CA-D1, BD-C1/BD-D1 |
| Customers | C | R | U | D | CU-C1, CU-R1, CU-U1, CU-D1 |
| Suppliers | C | R | U | D | SU-C1/R1/U1/D1, ST-C1/R1/U1/D1, DG-C1/R1/D1, STOCK-PUR-C1 |
| Accounting | C | R | - | D | EP-C1, EP-R1, EP-D1 |
| Sales History | - | R | - | - | SA-R1, EX-R1 |
| Branches | C | R | U | - | BR-C1, BR-R1, BR-U1, BR-U2 |
| Settings | C | R | U | D | US-C1/R1/U1/D1, SE-R1/U1, BR-U1, IMPORT-C1, IMPORT-U1, EXPORT-R1 |
| Offline Queue | - | R | U | D | OQ-R1, OQ-U1, OQ-U2, OQ-D1 |
| Sidebar | - | R | U(L) | D(L) | BRANCH-CTX-U1, VIEW-CTX-U1, SESSION-D1 |
| Login Page | C(L) | R | - | D(L) | SESSION-C1, US-R1 |

## 5. Canonical System CRUD Register (Runtime)

## 5.1 Branches And Branch Stock

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| BR-R1 | R | fetchBranches | public.branches | Initial load, sync, branch UI reads | No |
| BR-C1 | C | insertBranch | public.branches | Branches page, settings flow | Yes (ADD_BRANCH) |
| BR-U1 | U | updateBranch | public.branches | Branches page, settings printer save | Yes (UPDATE_BRANCH) |
| BR-U2 | U | initializeBranchStock | public.product_branch_stock | After branch create | Yes (part of ADD_BRANCH) |
| BRANCH-CTX-U1 | U(L) | setBranch | Context state + cart isolation | Sidebar branch switch | Local only |

## 5.2 Products And Branch Stock

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| PR-R1 | R | fetchProductsWithStock | public.products + public.product_branch_stock | Initial load, sync, inventory, POS | No |
| PR-C1 | C | insertProduct | public.products + public.product_branch_stock | Inventory add product, settings CSV import | Yes (ADD_PRODUCT) |
| PR-U1 | U | updateProduct | public.products + public.product_branch_stock | Inventory edit product | Yes (UPDATE_PRODUCT) |
| PR-R2 | R | getProductLinkedSalesCount | public.sale_items | Inventory delete confirmation | No |
| PR-D1 | D | deleteProduct BLOCK_IF_LINKED | public.products | Inventory delete mode 1 | Yes (DELETE_PRODUCT) |
| PR-D2 | D/U | deleteProduct KEEP_SALES_SNAPSHOT | public.sale_items + public.products | Inventory delete mode 2 | Yes (DELETE_PRODUCT) |
| PR-D3 | D | deleteProduct DELETE_LINKED_SALES | public.sales + public.products | Inventory delete mode 3 | Yes (DELETE_PRODUCT) |
| STK-U1 | U | upsertBranchStock | public.product_branch_stock | Stock adjustments, transfers, exchanges, purchases | Yes (varies by parent op) |

## 5.3 Customers

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| CU-R1 | R | fetchCustomers | public.customers | Initial load, sync, POS customer search, customer module | No |
| CU-C1 | C | insertCustomer | public.customers | Customers page, POS new customer | Yes (ADD_CUSTOMER) |
| CU-U1 | U | updateCustomer | public.customers | Customers page, sale/exchange loyalty updates | Yes (UPDATE_CUSTOMER) |
| CU-D1 | D | deleteCustomer | public.customers | Customers page delete | Yes (DELETE_CUSTOMER) |

## 5.4 Sales

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| SA-R1 | R | fetchSales | public.sales + public.sale_items | Initial load, sync, dashboard/history reads | No |
| SA-C1 | C/U | completeSaleRPC (fn_complete_sale) | RPC writes sales, sale_items, stock, customer effects | POS checkout, sale update reuse | Yes (COMPLETE_SALE, UPDATE_SALE) |
| SA-U1 | U | updateSale context flow | Same RPC as SA-C1 with recalculated payload | Dashboard edit sale | Yes (UPDATE_SALE) |
| SA-D1 | D | voidSaleRPC (fn_void_sale) | RPC restores stock, adjusts loyalty, deletes sale | Dashboard void sale | Yes (DELETE_SALE) |

## 5.5 Exchanges

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| EX-R1 | R | fetchExchanges | public.exchanges + public.exchange_items | Initial load, sync, history reads | No |
| EX-C1 | C | insertExchange | public.exchanges + public.exchange_items | POS exchange completion | Yes (COMPLETE_EXCHANGE) |
| EX-U1 | U | exchange stock/customer updates | public.product_branch_stock + public.stock_movements + public.customers | POS exchange completion | Yes (COMPLETE_EXCHANGE) |

## 5.6 Stock Movements And Transfers

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| SM-R1 | R | fetchStockMovements | public.stock_movements | Initial load, sync, dashboards, inventory logs | No |
| SM-C1 | C | insertStockMovement | public.stock_movements | Sales/exchange/adjustments/transfers/purchases | Yes (parent op) |
| ADJ-U1 | U | adjustStock flow | public.product_branch_stock + public.stock_movements | Inventory adjustment modal | Yes (ADJUST_STOCK) |
| TR-R1 | R | fetchStockTransfers | public.stock_transfers | Inventory transfer history, sync | No |
| TR-C1 | C | insertStockTransfer | public.stock_transfers | Inventory transfer submit | Yes (TRANSFER_STOCK) |
| TR-U1 | U | transferStock branch stock updates | public.product_branch_stock + public.stock_movements | Inventory transfer submit | Yes (TRANSFER_STOCK) |

## 5.7 Suppliers And Supplier Transactions

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| SU-R1 | R | fetchSuppliers | public.suppliers | Initial load, sync, suppliers page | No |
| SU-C1 | C | insertSupplier | public.suppliers | Suppliers add supplier | Yes (ADD_SUPPLIER) |
| SU-U1 | U | updateSupplier | public.suppliers | Suppliers edit supplier | Yes (UPDATE_SUPPLIER) |
| SU-D1 | D | deleteSupplier | public.suppliers | Suppliers delete supplier | Yes (DELETE_SUPPLIER) |
| ST-R1 | R | fetchSupplierTransactions | public.supplier_transactions | Initial load, sync, suppliers/accounting | No |
| ST-C1 | C | insertSupplierTransaction | public.supplier_transactions | Supplier transaction add, supplier expense | Yes (ADD_SUPPLIER_TRANSACTION, RECORD_SUPPLIER_EXPENSE) |
| ST-U1 | U | updateSupplierTransaction | public.supplier_transactions | Suppliers edit transaction | Yes (UPDATE_SUPPLIER_TRANSACTION) |
| ST-D1 | D | deleteSupplierTransaction | public.supplier_transactions | Suppliers delete transaction | Yes (DELETE_SUPPLIER_TRANSACTION) |
| STOCK-PUR-C1 | C/U | recordSupplierExpense flow | supplier_transactions + branch stock + movement logs | Suppliers expense form | Yes (RECORD_SUPPLIER_EXPENSE) |

## 5.8 Expenses

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| EP-R1 | R | fetchExpenses | public.expenses | Initial load, sync, accounting | No |
| EP-C1 | C | insertExpense | public.expenses | Accounting record expense | Yes (ADD_EXPENSE) |
| EP-D1 | D | deleteExpense | public.expenses | Accounting delete expense | Yes (DELETE_EXPENSE) |

## 5.9 Damaged Goods

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| DG-R1 | R | fetchDamagedGoods | public.damaged_goods | Initial load, sync, suppliers damaged tab | No |
| DG-C1 | C | insertDamagedGood | public.damaged_goods | Suppliers damaged entry | Yes (ADD_DAMAGED_GOOD) |
| DG-D1 | D | deleteDamagedGood | public.damaged_goods | Suppliers damaged delete | Yes (DELETE_DAMAGED_GOOD) |

## 5.10 Users, Settings, Master Data

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| US-R1 | R | fetchUsers | public.users | Initial load, settings users tab, login source | No |
| US-C1 | C | insertUser | public.users | Settings add user | Yes (ADD_USER) |
| US-U1 | U | updateUser | public.users | Settings edit user | Yes (UPDATE_USER) |
| US-D1 | D | deleteUser | public.users | Settings delete user | Yes (DELETE_USER) |
| SE-R1 | R | fetchSettings | public.app_settings | Initial load, settings page | No |
| SE-U1 | U | updateSettings | public.app_settings | Settings general save | Yes (UPDATE_SETTINGS) |
| CA-R1 | R | fetchCategories | public.categories | Initial load, product forms | No |
| CA-C1 | C | insertCategory | public.categories | Inventory category add | Yes (ADD_CATEGORY) |
| CA-D1 | D | deleteCategory | public.categories | Inventory category delete | Yes (REMOVE_CATEGORY) |
| BD-R1 | R | fetchBrands | public.brands | Initial load, product forms | No |
| BD-C1 | C | insertBrand | public.brands | Inventory brand add | Yes (ADD_BRAND) |
| BD-D1 | D | deleteBrand | public.brands | Inventory brand delete | Yes (REMOVE_BRAND) |

## 5.11 Data Import/Export And Sync Utility Operations

| ID | CRUD | Function/Action | Persistence Target | Triggered From | Offline Queue |
|---|---|---|---|---|---|
| EXPORT-R1 | R(L) | exportData | in-memory state to JSON download file | Settings data export | Local only |
| IMPORT-U1 | U(L) | importData(json) | in-memory state overwrite (+ local snapshot in local mode) | Settings data import | Local only |
| IMPORT-C1 | C/U | CSV import (addProduct loop) | public.products + public.product_branch_stock through PR-C1 | Settings import tab | Yes (through ADD_PRODUCT) |
| SYNC-R1 | R | syncData / refreshFromSupabase | multi-table read refresh | App DB banner retry, manual sync, startup flows | No |
| TR-R2 | R | refreshTransfers | public.stock_transfers read refresh | Inventory transfer history refresh button | No |

## 6. Local Persistence And Offline Runtime CRUD Register

| ID | CRUD | Action | Storage Key/Store | Trigger |
|---|---|---|---|---|
| OQ-R1 | R | Load offline queue on startup | localStorage hoard_offline_queue_v1 | StoreContext init |
| OQ-U1 | U | retryOfflineItem status changes (PENDING/SYNCING/FAILED) | local queue state + localStorage | OfflineQueue retry |
| OQ-U2 | U | syncOfflineQueue batch replay and status transitions | local queue state + localStorage | Auto-sync/manual sync |
| OQ-D1 | D | removeOfflineItem | local queue state + localStorage | OfflineQueue remove |
| LS-R1 | R | Load full local fallback data | localStorage hoard_data_v2 | No Supabase mode |
| LS-U1 | U | Save full local fallback data | localStorage hoard_data_v2 | Any state change in local mode |
| LS-R2 | R | Load transfer fallback | localStorage hoard_stock_transfers | Supabase transfer read empty/error fallback |
| LS-U2 | U | Save transfer fallback | localStorage hoard_stock_transfers | Transfer/exchange persistence backup |
| LS-R3 | R | Load exchange fallback | localStorage hoard_exchange_history | Supabase exchange read empty fallback |
| LS-U3 | U | Save exchange fallback | localStorage hoard_exchange_history | Transfer/exchange persistence backup |
| EXPORT-R1 | R(L) | exportData JSON snapshot | in-memory state -> file | Settings DATA tab |
| IMPORT-U1 | U(L) | importData full state restore | in-memory state <- file | Settings DATA tab |
| CART-C1 | C(L) | addToCart | in-memory cart state | POS |
| CART-U1 | U(L) | updateCartQuantity | in-memory cart state | POS |
| CART-U2 | U(L) | updateCartItemDiscount | in-memory cart state | POS |
| CART-D1 | D(L) | removeFromCart | in-memory cart state | POS |
| CART-D2 | D(L) | clearCart | in-memory cart state | POS/branch switch/logout |
| SESSION-C1 | C(L) | login | currentUser context state | Login page |
| SESSION-D1 | D(L) | logout | currentUser context state reset | Sidebar |
| VIEW-CTX-U1 | U(L) | setView | currentView context state | Sidebar/nav buttons |

## 7. Offline Operation Type Completeness (33/33)

Source: types.ts OfflineOperationType

| OfflineOperationType | CRUD Class | Primary Runtime Action |
|---|---|---|
| ADD_BRANCH | C | Branch create |
| UPDATE_BRANCH | U | Branch update |
| ADD_PRODUCT | C | Product create |
| UPDATE_PRODUCT | U | Product update |
| DELETE_PRODUCT | D | Product delete |
| ADD_CUSTOMER | C | Customer create |
| UPDATE_CUSTOMER | U | Customer update |
| DELETE_CUSTOMER | D | Customer delete |
| COMPLETE_SALE | C | Sale create |
| UPDATE_SALE | U | Sale edit |
| DELETE_SALE | D | Sale void |
| COMPLETE_EXCHANGE | C/U | Exchange + stock/customer updates |
| ADJUST_STOCK | U | Manual stock adjustment |
| TRANSFER_STOCK | C/U | Transfer + stock updates |
| ADD_CATEGORY | C | Category create |
| REMOVE_CATEGORY | D | Category delete |
| ADD_BRAND | C | Brand create |
| REMOVE_BRAND | D | Brand delete |
| ADD_SUPPLIER | C | Supplier create |
| UPDATE_SUPPLIER | U | Supplier update |
| DELETE_SUPPLIER | D | Supplier delete |
| RECORD_SUPPLIER_EXPENSE | C/U | Supplier expense + stock updates |
| ADD_SUPPLIER_TRANSACTION | C | Supplier transaction create |
| UPDATE_SUPPLIER_TRANSACTION | U | Supplier transaction update |
| DELETE_SUPPLIER_TRANSACTION | D | Supplier transaction delete |
| ADD_EXPENSE | C | Expense create |
| DELETE_EXPENSE | D | Expense delete |
| ADD_DAMAGED_GOOD | C | Damaged good create |
| DELETE_DAMAGED_GOOD | D | Damaged good delete |
| ADD_USER | C | User create |
| UPDATE_USER | U | User update |
| DELETE_USER | D | User delete |
| UPDATE_SETTINGS | U | Settings update |

## 8. Recovery And Migration Appendix CRUD Register

These are not normal page runtime operations, but they are persistence operations and must be tracked for completeness.

| ID | CRUD | Source | What It Does | Persistence Target |
|---|---|---|---|---|
| RC-C1 | C | scripts/offline-sales-recovery.js | Generates idempotent SQL that calls fn_complete_sale for missing offline sales | sales, sale_items, stock_movements, product_branch_stock, customers (via RPC) |
| RC-C2 | C | scripts/supplier-expense-recovery.js | Generates idempotent SQL for supplier transaction recovery | supplier_transactions |
| RC-C3 | C | scripts/recover-supplier-expense-2026-04-06.sql | Manual SQL recovery: creates supplier if missing and inserts supplier transaction if reference not present | suppliers, supplier_transactions |
| MG-C1 | C/U | migrations/001_initial_schema.sql + later fn_complete_sale migrations | Defines/updates sale completion RPC behavior | sales domain tables |
| MG-D1 | D/U | migrations/009_void_sale.sql | Defines sale void RPC behavior with rollback side effects | sales, stock, customer aggregates |
| MG-U1 | U | migrations/008_cash_card_split_payments.sql | Extends split payment fields and function signature | sales + fn_complete_sale signature |
| MG-U2 | U | migrations/011_sale_item_variant_snapshots.sql | Adds immutable sale item snapshot columns and updated insert behavior | sale_items |

## 9. Friendly Error Message Sources (Runtime)

Friendly message generation points:
- context/StoreContext.tsx -> extractDbErrorMessage
- context/StoreContext.tsx -> executeWithOfflineQueue fallback messages
- services/supabaseService.ts -> explicit migration/schema messages for legacy RPC signatures and missing columns/tables

Common friendly patterns documented in runtime:
- Connectivity failures: operation saved offline and queued for retry.
- FK or required field issues: related data missing/invalid.
- Schema cache or missing column issues: instruct migration/cache refresh.
- Missing RPC function: instruct applying migration 008 or 009.

## 10. Final Completeness Checklist

- [x] All routed pages mapped.
- [x] All service persistence operations mapped.
- [x] All OfflineOperationType values mapped.
- [x] Local/offline persistence mapped.
- [x] Recovery/migration persistence mapped.
- [x] Friendly error source paths identified.

This index is intentionally exhaustive and is the reference for the detailed testing guide in CRUD_Operations_Testing_Guide.md.
