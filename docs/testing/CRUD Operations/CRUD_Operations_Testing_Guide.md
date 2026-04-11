# Hoard Lavish ERP - CRUD Testing Implementation Guide

Date: 2026-04-11  
Owner: QA Documentation  
Scope: Detailed test implementation guidance for every CRUD operation in runtime + recovery appendix

## 1. Important Notes

- This is documentation only. No tests are executed here.
- All mock data must go to a separate Supabase test project, never production.
- This guide is written to be senior-QA grade but simple enough for intern execution.

## 2. Test Environment Isolation (Primary Approach)

Recommended default: separate Supabase project for testing.

## 2.1 Why separate project is primary

- Zero risk of writing mock records to production.
- Safe destructive testing (delete, void, rollback, replay) without business impact.
- Easier reset between test cycles.

## 2.2 Required setup

1. Create a dedicated Supabase project, for example hoard-lavish-erp-test.
2. Apply migrations from supabase/migrations in that test project.
3. Use test-only environment variables in app runtime during QA:
   - VITE_SUPABASE_URL = test project URL
   - VITE_SUPABASE_ANON_KEY = test project anon key
4. Verify the connected project is test before any CRUD execution.
5. Keep production credentials out of QA sessions.

## 2.3 If someone asks for a same-project test area

Fallback option exists but is not recommended as primary:
- Same Supabase project with strict schema segmentation such as test.* and strict policies.
- Risk is still higher than separate project.

Use only when separate project is impossible and only with lead approval.

## 3. Header Profiles And Auth Context

## 3.1 Header profile H-SUPABASE-01 (table CRUD)

Use for REST-style table CRUD documentation.

- apikey: <TEST_SUPABASE_ANON_KEY>
- Authorization: Bearer <TEST_SUPABASE_ANON_KEY>
- Content-Type: application/json
- Prefer: return=representation (for create/update response assertions)

## 3.2 Header profile H-SUPABASE-RPC-01 (RPC calls)

Use for fn_complete_sale and fn_void_sale.

- apikey: <TEST_SUPABASE_ANON_KEY>
- Authorization: Bearer <TEST_SUPABASE_ANON_KEY>
- Content-Type: application/json

## 3.3 Header profile H-LOCAL-01 (local state/localStorage)

- No HTTP headers.
- Validation is state transition + storage key assertions.

## 4. Mock Data Blueprint (Minimum Viable Pack)

Use this baseline data in test project to cover all CRUD paths.

- Branches: 2 branches (Mount Lavinia, Ethul Kotte)
- Products: at least 4 products with different category/brand/size/color/barcodes
- Product branch stock: stock rows for each product per branch
- Customers: 2 customers (one with existing loyalty)
- Suppliers: 2 suppliers
- Users: ADMIN, MANAGER, CASHIER
- Categories and brands: at least 3 each
- App settings: one row
- Empty or controlled tables for sales/exchanges/stock movements/transfers/expenses/damaged_goods

Example product payload (function-call style):

{
  "id": "f2f5f3b0-0f90-4f69-a2d7-5fc2907f05a7",
  "name": "Oxford Shirt - Navy / L",
  "category": "Shirts",
  "brand": "Lavish",
  "price": 4500,
  "costPrice": 2900,
  "minStockLevel": 5,
  "sku": "SH-OKF-NV-L",
  "description": "Slim fit oxford shirt",
  "color": "Navy",
  "size": "L",
  "barcode": "2001234567890",
  "barcode2": "2001234567891",
  "branchStock": {
    "branch-1": 12,
    "branch-2": 8
  }
}

## 5. Global Edge-Case Suite (Apply To Every CRUD)

Run these categories for each relevant operation:

1. Empty state: table empty or no matching record.
2. Invalid input format: wrong UUID, wrong number format, null required field.
3. Duplicate value: unique constraint collision (for name/SKU/reference where relevant).
4. FK integrity: referenced record missing.
5. Permission/role mismatch: UI role should prevent forbidden action where applicable.
6. Network down: operation should queue or fail gracefully based on design.
7. Timeout/transient backend errors.
8. Schema mismatch: missing column/function fallback where code supports it.
9. Race condition: retry same operation quickly.
10. Idempotency check: ensure duplicate replay does not corrupt data.
11. Friendly error message quality: user-facing message should be actionable.
12. Offline retry correctness: queued payload replays correctly.
13. Data consistency: optimistic local state eventually converges with server state.
14. Branch isolation: branch-specific stock/sales should stay scoped.
15. Date/time handling: no timezone drift for business dates.

## 6. Operation Test Cards (Runtime CRUD)

Use operation IDs from CRUD_Operations_Index.md.

## 6.1 Branches And Branch Stock

### BR-R1 fetchBranches
- HTTP-style: GET /rest/v1/branches?select=*&order=created_at.asc
- Header profile: H-SUPABASE-01
- Function-call: db.fetchBranches()
- Expected success: branches sorted by created_at with printer name resolution fallback.
- Friendly error: Database request failed due to internet connection issue.
- Edge cases: no branches, missing printer fields, network failure.
- Offline behavior: not queueable.

### BR-C1 insertBranch
- HTTP-style: POST /rest/v1/branches
- Header profile: H-SUPABASE-01
- Function-call: db.insertBranch(branch)
- Payload keys: id optional, name, address, phone, thermal_printer_name, barcode_printer_name.
- Expected success: branch row created and returned.
- Friendly error: Failed to add branch.
- Edge cases: duplicate id, empty name/address, invalid UUID.
- Offline behavior: queueable via ADD_BRANCH.

### BR-U1 updateBranch
- HTTP-style: PATCH /rest/v1/branches?id=eq.<branchId>
- Header profile: H-SUPABASE-01
- Function-call: db.updateBranch(id, updates)
- Payload keys: name/address/phone/printer names (partial).
- Expected success: branch row updated.
- Friendly error: Failed to update branch.
- Edge cases: invalid branch id, partial update only, missing row.
- Offline behavior: queueable via UPDATE_BRANCH.

### BR-U2 initializeBranchStock
- HTTP-style: POST /rest/v1/product_branch_stock (upsert on product_id,branch_id)
- Header profile: H-SUPABASE-01
- Function-call: db.initializeBranchStock(branchId, productIds)
- Expected success: zero-quantity stock rows for new branch.
- Friendly error: Related stock data is missing or invalid.
- Edge cases: empty product list, duplicate rows.
- Offline behavior: executed inside ADD_BRANCH replay.

## 6.2 Products

### PR-R1 fetchProductsWithStock
- HTTP-style:
  - GET /rest/v1/products?select=id,name,category,brand,price,cost_price,min_stock_level,sku,description,image_url,color,size,barcode,barcode2,created_at&order=created_at.asc
  - GET /rest/v1/product_branch_stock?select=product_id,branch_id,quantity
- Header profile: H-SUPABASE-01
- Function-call: db.fetchProductsWithStock()
- Expected success: merged product + branchStock map.
- Friendly error: Generic DB banner from syncData path.
- Edge cases: missing stock rows, numeric string coercion, empty products.
- Offline behavior: not queueable read.

### PR-C1 insertProduct
- HTTP-style: POST /rest/v1/products + POST /rest/v1/product_branch_stock
- Header profile: H-SUPABASE-01
- Function-call: db.insertProduct(product, branches)
- Payload keys: name/category/brand/price/cost_price/min_stock_level/sku/description/color/size/barcodes + branchStock rows.
- Expected success: product and stock rows created.
- Friendly error: Failed to add product.
- Edge cases: duplicate sku, stock row insert fails (rollback check), zero stock, invalid barcode values.
- Offline behavior: queueable via ADD_PRODUCT.

### PR-U1 updateProduct
- HTTP-style: PATCH /rest/v1/products?id=eq.<productId> + upsert stock rows
- Header profile: H-SUPABASE-01
- Function-call: db.updateProduct(id, updates)
- Payload keys: partial product fields + optional branchStock.
- Expected success: product updated and stock upserted if sent.
- Friendly error: Failed to update product.
- Edge cases: partial field patch, branchStock only update, invalid numeric fields.
- Offline behavior: queueable via UPDATE_PRODUCT.

### PR-R2 getProductLinkedSalesCount
- HTTP-style: GET /rest/v1/sale_items?select=sale_id&product_id=eq.<productId>
- Header profile: H-SUPABASE-01
- Function-call: db.getProductLinkedSalesCount(productId)
- Expected success: unique linked sale count.
- Friendly error: falls back to 0 with banner if fetch fails.
- Edge cases: product not used in sales, malformed product id.
- Offline behavior: read only, not queued.

### PR-D1/PR-D2/PR-D3 deleteProduct modes
- HTTP-style:
  - Mode BLOCK_IF_LINKED: DELETE /rest/v1/products?id=eq.<productId> (should block if linked)
  - Mode KEEP_SALES_SNAPSHOT: PATCH /rest/v1/sale_items?product_id=eq.<productId> set product_id=null, then DELETE product
  - Mode DELETE_LINKED_SALES: DELETE linked sales then DELETE product
- Header profile: H-SUPABASE-01
- Function-call: db.deleteProduct(id, mode)
- Expected success: mode-specific behavior enforced.
- Friendly errors:
  - Cannot delete this product because it is linked to sales history.
  - Migration required for nullable sale_items.product_id (if 23502).
- Edge cases: linked sales present, missing migration 007 behavior, invalid mode.
- Offline behavior: queueable via DELETE_PRODUCT.

## 6.3 Customers

### CU-R1 fetchCustomers
- HTTP-style: GET /rest/v1/customers?select=*&order=created_at.asc
- Header profile: H-SUPABASE-01
- Function-call: db.fetchCustomers()
- Edge cases: empty table, malformed totals.
- Offline behavior: read only.

### CU-C1 insertCustomer
- HTTP-style: POST /rest/v1/customers
- Payload keys: id optional, name, phone, email, loyalty_points, total_spent.
- Friendly error: Failed to add customer / duplicate record exists.
- Edge cases: duplicate phone/email, missing required name.
- Offline behavior: queueable ADD_CUSTOMER.

### CU-U1 updateCustomer
- HTTP-style: PATCH /rest/v1/customers?id=eq.<customerId>
- Payload keys: partial fields including loyalty_points and total_spent.
- Friendly error: Failed to update customer.
- Edge cases: negative loyalty points protection at context level.
- Offline behavior: queueable UPDATE_CUSTOMER.

### CU-D1 deleteCustomer
- HTTP-style: DELETE /rest/v1/customers?id=eq.<customerId>
- Friendly error: Failed to delete customer.
- Edge cases: deleting customer with historical sales snapshots.
- Offline behavior: queueable DELETE_CUSTOMER.

## 6.4 Sales

### SA-R1 fetchSales
- HTTP-style: GET /rest/v1/sales?select=*,sale_items(*,products(id,name,sku,size,color,barcode,barcode2))&order=date.desc
- Function-call: db.fetchSales()
- Expected success: mapped sale history with item snapshots.
- Edge cases: null product_id in historical sale_items, empty sale_items.
- Offline behavior: read only.

### SA-C1 completeSaleRPC
- HTTP-style: POST /rest/v1/rpc/fn_complete_sale
- Header profile: H-SUPABASE-RPC-01
- Function-call: db.completeSaleRPC(sale)
- Payload keys:
  - p_invoice_number, p_date, p_subtotal, p_discount, p_tax, p_total_amount, p_total_cost
  - p_payment_method, p_customer_id, p_customer_name, p_branch_id, p_branch_name
  - p_cash_amount, p_card_amount
  - p_items[] with product_id, product_name, quantity, price, cost_price, discount, sku, size, color, barcode, barcode2
- Friendly errors:
  - Database is outdated for Cash+Card checkout. Apply migration 008.
  - Checkout failed due to internet connection issue.
- Edge cases:
  - split payment total mismatch
  - negative cash/card amounts
  - legacy function signature fallback
  - invalid customer UUID becomes null
- Offline behavior: queueable COMPLETE_SALE and replayable.

### SA-U1 updateSale
- Runtime flow: dashboard edits recalculate stock and loyalty, then reuses SA-C1 RPC.
- Function-call: updateSale(...) then db.completeSaleRPC(updatedSale)
- Friendly error: Checkout update failed.
- Edge cases:
  - edit within allowed time window
  - customer changed vs same customer delta
  - stock net adjustment correctness
- Offline behavior: queueable UPDATE_SALE.

### SA-D1 voidSaleRPC
- HTTP-style: POST /rest/v1/rpc/fn_void_sale
- Header profile: H-SUPABASE-RPC-01
- Function-call: db.voidSaleRPC(saleId)
- Friendly errors:
  - Database is outdated for sale voiding. Apply migration 009.
  - Failed to void sale.
- Edge cases:
  - sale not found
  - stock restore + loyalty reversal atomicity
- Offline behavior: queueable DELETE_SALE.

## 6.5 Exchanges

### EX-R1 fetchExchanges
- HTTP-style: GET /rest/v1/exchanges?select=*,exchange_items(*)&order=date.desc
- Function-call: db.fetchExchanges()
- Edge cases: no items, malformed numeric snapshot fields.
- Offline behavior: read only.

### EX-C1 / EX-U1 completeExchange + persistence
- HTTP-style:
  - POST /rest/v1/exchanges
  - POST /rest/v1/exchange_items
  - Upsert product_branch_stock
  - POST stock_movements
  - PATCH customers (if linked)
- Function-call: completeExchange(exchangeData)
- Payload keys:
  - exchange header: original sale refs, totals, difference, payment/refund methods, settlement type
  - return/new item lines with variant snapshots and pricing split fields
- Friendly errors:
  - Return quantity exceeds available quantity for line item.
  - Failed to save exchange.
- Edge cases:
  - over-return prevention across prior exchanges
  - no-sale-return items
  - positive/negative/even settlement
  - loyalty delta calculation
- Offline behavior: queueable COMPLETE_EXCHANGE.

## 6.6 Stock Movements And Transfers

### SM-R1 fetchStockMovements
- HTTP-style: GET /rest/v1/stock_movements?select=*&order=date.desc
- Function-call: db.fetchStockMovements()
- Edge cases: high volume ordering, branch filter in UI.
- Offline behavior: read only.

### SM-C1 insertStockMovement
- HTTP-style: POST /rest/v1/stock_movements
- Payload keys: product_id, product_name, branch_id, branch_name, type, quantity, reason, date.
- Friendly error: Failed to adjust/transfer/record stock movement.
- Edge cases: invalid type, negative quantity blocked by caller.
- Offline behavior: queueable by parent operations.

### ADJ-U1 adjustStock
- Runtime flow: local stock update + movement log + STK-U1 + SM-C1
- Friendly error: Failed to adjust stock.
- Edge cases:
  - OUT beyond available stock
  - ADJUSTMENT absolute delta logging
  - reason mandatory in UI
- Offline behavior: queueable ADJUST_STOCK.

### TR-R1 fetchStockTransfers
- HTTP-style: GET /rest/v1/stock_transfers?select=*&order=date.desc
- Edge cases: table missing fallback to empty list.
- Offline behavior: read only.

### TR-C1 / TR-U1 transferStock
- HTTP-style:
  - POST /rest/v1/stock_transfers
  - Upsert product_branch_stock for source and destination
  - POST stock_movements (OUT + IN)
- Payload keys:
  - transfer header: transfer_number, from/to branches, items JSON, totals, notes
  - items[]: productId, quantity, unitPrice, costPrice
- Friendly error:
  - Transfer <number> saved locally but failed to sync with database.
- Edge cases:
  - destination equals source
  - insufficient source stock
  - multi-item transfer total-value consistency
- Offline behavior: queueable TRANSFER_STOCK.

## 6.7 Suppliers And Supplier Transactions

### SU-R1 fetchSuppliers
- HTTP-style: GET /rest/v1/suppliers?select=*&order=created_at.asc
- Edge cases: empty table.
- Offline behavior: read only.

### SU-C1 insertSupplier
- HTTP-style: POST /rest/v1/suppliers
- Payload keys: name, contact_person, phone, email, address.
- Friendly error: Failed to add supplier.
- Edge cases: duplicate supplier values.
- Offline behavior: queueable ADD_SUPPLIER.

### SU-U1 updateSupplier
- HTTP-style: PATCH /rest/v1/suppliers?id=eq.<supplierId>
- Payload keys: partial supplier fields.
- Friendly error: Failed to update supplier.
- Offline behavior: queueable UPDATE_SUPPLIER.

### SU-D1 deleteSupplier
- HTTP-style: DELETE /rest/v1/suppliers?id=eq.<supplierId>
- Friendly error: Failed to delete supplier.
- Edge cases: linked transactions still exist.
- Offline behavior: queueable DELETE_SUPPLIER.

### ST-R1 fetchSupplierTransactions
- HTTP-style: GET /rest/v1/supplier_transactions?select=*&order=date.desc
- Edge cases: missing affects_accounting column fallback query.
- Offline behavior: read only.

### ST-C1 insertSupplierTransaction
- HTTP-style: POST /rest/v1/supplier_transactions
- Payload keys: supplier_id, supplier_name, date, amount, type, reference, notes, affects_accounting optional.
- Friendly errors: schema cache/missing column fallbacks.
- Edge cases: column not available, duplicate reference.
- Offline behavior: queueable ADD_SUPPLIER_TRANSACTION.

### ST-U1 updateSupplierTransaction
- HTTP-style: PATCH /rest/v1/supplier_transactions?id=eq.<txnId>
- Payload keys: partial transaction fields.
- Friendly error: Failed to update supplier transaction.
- Edge cases:
  - temporary non-UUID local id should skip remote call
  - missing affects_accounting fallback
- Offline behavior: queueable UPDATE_SUPPLIER_TRANSACTION.

### ST-D1 deleteSupplierTransaction
- HTTP-style: DELETE /rest/v1/supplier_transactions?id=eq.<txnId>
- Friendly error: Failed to delete supplier transaction.
- Edge cases: non-UUID local id skips remote delete.
- Offline behavior: queueable DELETE_SUPPLIER_TRANSACTION.

### STOCK-PUR-C1 recordSupplierExpense
- Runtime flow: create supplier transaction + aggregate product stock IN + stock movements.
- Function-call: recordSupplierExpense(transaction, stockAdjustments)
- Payload keys:
  - transaction object
  - stockAdjustments[] { productId, quantity, reason }
- Friendly error: Failed to record supplier expense.
- Edge cases:
  - duplicate product lines must aggregate
  - quantity <= 0 should be ignored
  - forceQueueOnError path
- Offline behavior: queueable RECORD_SUPPLIER_EXPENSE.

## 6.8 Expenses

### EP-R1 fetchExpenses
- HTTP-style: GET /rest/v1/expenses?select=*&order=date.desc
- Edge cases: branch filter correctness in accounting view.
- Offline behavior: read only.

### EP-C1 insertExpense
- HTTP-style: POST /rest/v1/expenses
- Payload keys: description, amount, category, date, branch_id, branch_name, payment_method.
- Friendly error: Failed to add expense.
- Edge cases: invalid amount, missing category/description.
- Offline behavior: queueable ADD_EXPENSE.

### EP-D1 deleteExpense
- HTTP-style: DELETE /rest/v1/expenses?id=eq.<expenseId>
- Friendly error: Failed to delete expense.
- Edge cases: local temp id should skip remote delete.
- Offline behavior: queueable DELETE_EXPENSE.

## 6.9 Damaged Goods

### DG-R1 fetchDamagedGoods
- HTTP-style: GET /rest/v1/damaged_goods?select=*&order=date.desc
- Edge cases: empty table.
- Offline behavior: read only.

### DG-C1 insertDamagedGood
- HTTP-style: POST /rest/v1/damaged_goods
- Payload keys: product_id, product_name, supplier_id, supplier_name, quantity, unit_price, total_loss, reason, date.
- Friendly error: Failed to add damaged good.
- Edge cases: FK mismatch for product/supplier, negative quantity.
- Offline behavior: queueable ADD_DAMAGED_GOOD.

### DG-D1 deleteDamagedGood
- HTTP-style: DELETE /rest/v1/damaged_goods?id=eq.<damageId>
- Friendly error: Failed to delete damaged good.
- Edge cases: deleting already deleted row.
- Offline behavior: queueable DELETE_DAMAGED_GOOD.

## 6.10 Users, Settings, Categories, Brands

### US-R1 fetchUsers
- HTTP-style: GET /rest/v1/users?select=*&order=created_at.asc
- Edge cases: role field mapping.
- Offline behavior: read only.

### US-C1 insertUser
- HTTP-style: POST /rest/v1/users
- Payload keys: name, role, pin, branch_id optional.
- Friendly error: Failed to add user.
- Edge cases: duplicate pin policy (if enforced externally).
- Offline behavior: queueable ADD_USER.

### US-U1 updateUser
- HTTP-style: PATCH /rest/v1/users?id=eq.<userId>
- Payload keys: partial user fields.
- Friendly error: Failed to update user.
- Edge cases: invalid role value.
- Offline behavior: queueable UPDATE_USER.

### US-D1 deleteUser
- HTTP-style: DELETE /rest/v1/users?id=eq.<userId>
- Friendly error: Failed to delete user.
- Edge cases: deleting currently logged in user behavior.
- Offline behavior: queueable DELETE_USER.

### SE-R1 fetchSettings
- HTTP-style: GET /rest/v1/app_settings?select=*&limit=1
- Edge cases: no settings row.
- Offline behavior: read only.

### SE-U1 updateSettings
- HTTP-style:
  - GET /rest/v1/app_settings?select=id&limit=1
  - PATCH /rest/v1/app_settings?id=eq.<settingsId>
- Payload keys: store_name, currency_symbol, tax_rate, enable_low_stock_alerts.
- Friendly error: Failed to update settings.
- Edge cases: tax rate boundaries, missing row id.
- Offline behavior: queueable UPDATE_SETTINGS.

### CA-R1 / CA-C1 / CA-D1 categories
- Read: GET /rest/v1/categories?select=name&order=name.asc
- Create: POST /rest/v1/categories { name }
- Delete: DELETE /rest/v1/categories?name=eq.<name>
- Friendly errors: add/remove category failures.
- Edge cases: duplicates ignored on create (23505), deleting in-use category.
- Offline behavior: create/delete queueable.

### BD-R1 / BD-C1 / BD-D1 brands
- Read: GET /rest/v1/brands?select=name&order=name.asc
- Create: POST /rest/v1/brands { name }
- Delete: DELETE /rest/v1/brands?name=eq.<name>
- Friendly errors: add/remove brand failures.
- Edge cases: duplicates ignored on create (23505), deleting in-use brand.
- Offline behavior: create/delete queueable.

## 6.11 Local/Offline Operational CRUD

### OQ-R1 load offline queue
- Storage: localStorage hoard_offline_queue_v1
- Function path: StoreContext startup effect.
- Mock data: array of OfflineQueueItem with mixed statuses.
- Edge cases: malformed JSON, unknown operation type.

### OQ-U1 retryOfflineItem
- Behavior: status PENDING/FAILED -> SYNCING -> removed or FAILED with retryCount+1.
- Friendly message: synced popup or extracted DB error.
- Edge cases: item missing, network drop mid-replay.

### OQ-U2 syncOfflineQueue
- Behavior: FIFO replay by createdAt.
- Edge cases: partial success, all-success triggers refreshFromSupabase.

### OQ-D1 removeOfflineItem
- Behavior: manual discard from queue.
- Edge case: ensure no accidental replay after remove.

### LS-R1/LS-U1 local data snapshot hoard_data_v2
- Reads/writes in local-only mode.
- Edge cases: partial snapshot fields missing.

### LS-R2/LS-U2 transfer fallback hoard_stock_transfers
- Used when table missing or fetch returns empty.
- Edge cases: parse errors, stale transfer records.

### LS-R3/LS-U3 exchange fallback hoard_exchange_history
- Used when exchange fetch empty/fails.
- Edge cases: parse errors, stale history reconciliation.

### CART-C1 / CART-U1 / CART-U2 / CART-D1 / CART-D2
- Local cart CRUD only.
- Critical edge cases:
  - quantity cannot exceed current branch stock
  - discount cannot drop below 0
  - clear cart on branch switch/logout

### SESSION-C1 / SESSION-D1 / VIEW-CTX-U1 / BRANCH-CTX-U1
- Session/view local state transitions.
- Critical edge cases:
  - role-based view guard fallback to Dashboard
  - branch switch clears cart to prevent cross-branch billing

## 6.12 Settings Data Import/Export And Sync Utility Operations

### EXPORT-R1 exportData
- Type: local read/export.
- Function-call: exportData()
- Output: JSON string containing current in-memory ERP state.
- Validation checklist:
  - downloaded file exists and is valid JSON
  - major arrays/objects present (products, branches, customers, salesHistory, settings)
  - no runtime crash when state is large
- Friendly error expectation: if export fails, UI should not crash; user should be informed by UI context.

### IMPORT-U1 importData
- Type: local update/overwrite.
- Function-call: importData(jsonString)
- Input payload: full ERP snapshot JSON.
- Validation checklist:
  - returns true for valid shape and false for invalid JSON/shape
  - in-memory state is replaced as expected
  - follow-up screens reflect imported data
  - local fallback snapshot behavior remains consistent
- Edge cases:
  - malformed JSON
  - missing required arrays
  - partial snapshot with legacy fields

### IMPORT-C1 CSV product import
- Type: create/update pathway via addProduct loop.
- Runtime route: Settings import tab -> parse CSV -> validation -> addProduct per row.
- Required columns: name, category, brand, sku, price, costPrice.
- Validation checklist:
  - invalid rows reported before confirm
  - successful rows create products and branch stock rows
  - optional columns (color, size, barcode, barcode2) map correctly
  - import count equals inserted rows
- Friendly errors:
  - clear row-level validation messages for missing/invalid fields
  - failed create follows existing product add friendly-error flow
- Offline behavior: each created product is queueable through ADD_PRODUCT flow.

### SYNC-R1 syncData / refreshFromSupabase
- Type: multi-entity read refresh.
- Function-call: syncData() -> refreshFromSupabase()
- Validation checklist:
  - returns success boolean and productCount on success
  - updates in-memory collections from cloud state
  - sets lastSyncTime and isCloudConnected correctly
  - sets friendly dbError on failure
- Edge cases:
  - one table read fails while others succeed
  - connectivity flaps during sync
  - transfer/exchange fallback usage when cloud result is empty

### TR-R2 refreshTransfers
- Type: targeted read refresh for transfer history.
- Function-call: refreshTransfers()
- Validation checklist:
  - transfer list updates without requiring full app reload
  - isLoading toggles as expected
  - dbError set on failure and cleared on success
- Edge cases:
  - stock_transfers table missing
  - network timeout during manual refresh

## 7. Recovery And Migration Appendix Test Cards

### RC-C1 offline-sales-recovery.js
- Type: manual recovery SQL generation for missing offline sales.
- Generated SQL behavior: idempotent by invoice_number and uses fn_complete_sale.
- Validation checklist:
  - script filters correct branch and business date
  - generated items JSON has expected fields
  - duplicate invoice does not insert again
  - SQL text copied safely

### RC-C2 supplier-expense-recovery.js
- Type: manual recovery SQL generation for supplier transaction only.
- Validation checklist:
  - supplier id resolves correctly
  - unresolved product cost prompts warning
  - notes contain line-level quantity and pricing
  - idempotent by reference

### RC-C3 recover-supplier-expense-2026-04-06.sql
- Type: direct SQL recovery script.
- Validation checklist:
  - creates supplier if missing
  - validates all product names resolve before insert
  - inserts supplier transaction once by reference
  - does not update stock tables

### MG-C1 / MG-D1 / MG-U1 / MG-U2 migration-sensitive runtime checks
- Confirm runtime behavior under migration states:
  - 008 missing: Cash+Card checkout should show migration-friendly error.
  - 009 missing: void sale should show migration-friendly error.
  - supplier_transactions affects_accounting column missing: fallback query/insert/update works.
  - stock_transfers table missing: safe fallback to local transfer history.

## 8. Friendly Error Message Validation Checklist

For each operation, confirm:

1. User sees a clear, non-technical message first.
2. Message tells user what to do next where possible.
3. Connectivity errors route to offline queue when queueable.
4. Non-queueable errors show DB banner and allow retry sync.
5. Migration mismatch errors explicitly mention migration action.

## 9. Intern Execution Template (Per Operation)

Use this quick checklist per operation ID:

1. Prepare mock records in test project only.
2. Execute operation from UI trigger and/or function-call simulation.
3. Validate persistence change in expected table(s).
4. Validate in-app state changes and UI message.
5. Trigger one failure case and validate friendly error.
6. Trigger offline scenario and validate queue/retry behavior.
7. Record result with screenshot/log and pass/fail reason.

## 10. Final QA Readiness Checklist

- [x] Separate test project strategy documented.
- [x] Headers and auth context documented.
- [x] Mock data guidance documented.
- [x] Runtime CRUD operations documented with payload and edge cases.
- [x] Local/offline operations documented.
- [x] Recovery/migration appendix operations documented.
- [x] Friendly error validation coverage documented.

This guide should be used together with CRUD_Operations_Index.md for complete traceability and execution planning.
