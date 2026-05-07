# Graph Report - hoard-lavish-erp-main  (2026-05-07)

## Corpus Check
- 53 files · ~1,643,018 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 306 nodes · 402 edges · 15 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 17|Community 17]]

## God Nodes (most connected - your core abstractions)
1. `loadAll()` - 17 edges
2. `isUuid()` - 17 edges
3. `parseBusinessDate()` - 9 edges
4. `extractDbErrorMessage()` - 7 edges
5. `makeUuid()` - 7 edges
6. `fmtCurrency()` - 6 edges
7. `handleAddToCart()` - 5 edges
8. `printReceiptForSale()` - 5 edges
9. `addCustomer()` - 5 edges
10. `completeSale()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `isInPeriod()` --calls--> `parseBusinessDate()`  [INFERRED]
  components\Accounting.tsx → utils\dateTime.ts
- `loadAll()` --calls--> `fetchBranches()`  [INFERRED]
  context\StoreContext.tsx → services\db\branches.ts
- `loadAll()` --calls--> `fetchProductsWithStock()`  [INFERRED]
  context\StoreContext.tsx → services\db\products.ts
- `loadAll()` --calls--> `fetchCustomers()`  [INFERRED]
  context\StoreContext.tsx → services\db\customers.ts
- `loadAll()` --calls--> `fetchStockMovements()`  [INFERRED]
  context\StoreContext.tsx → services\db\stockMovements.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (24): handleSaveExpense(), isInPeriod(), handleSave(), isUuid(), makeUuid(), handleCreateCustomer(), handleSaveProduct(), updateProduct() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (17): async(), handleConfirmVariationPrint(), handleDeleteConfirm(), handleDeleteKeepSales(), handleDeleteRequest(), handleDeleteWithSales(), handlePrintBarcode(), handleSubmitAdjustment() (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (22): calculateCartTotals(), getMountLaviniaDefaultPrinter(), getThermalPrinterName(), handleAddToCart(), handleBarcodeSubmit(), handleCheckout(), handleCompleteExchange(), handleGlobalKeyDown() (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (12): fetchExpenses(), insertExpense(), completeSaleRPC(), fetchExchanges(), fetchSales(), insertExchange(), fetchBrands(), fetchCategories() (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (16): addSupplier(), recordSupplierExpense(), deleteSupplier(), deleteSupplierTransaction(), fetchSuppliers(), fetchSupplierTransactions(), handleDeleteConfirm(), handleDeleteTransaction() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (12): parseBusinessDate(), fmtCurrency(), generateDayEndReport(), generateTransferPDF(), handleBillDiscountChange(), handleItemDiscountChange(), isSaleEditable(), timeAgo() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (9): handleCSVFileChange(), handleExport(), handleSaveUser(), processCSVFile(), addUser(), exportData(), fetchUsers(), insertUser() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (11): extractDbErrorMessage(), isLikelyConnectivityIssue(), handleSyncAll(), deleteProduct(), dismissDbError(), refreshTransfers(), retryOfflineItem(), syncOfflineQueue() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.2
Nodes (11): getThermalPrinterForBranch(), isMountLaviniaBranch(), normalizeBranchName(), fetchBranches(), getDefaultThermalPrinter(), insertBranch(), resolveThermalPrinterName(), updateBranch() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.24
Nodes (8): deleteDamagedGood(), deleteDamagedGoodByRecord(), fetchDamagedGoods(), insertDamagedGood(), fetchStockMovements(), insertStockMovement(), upsertBranchStock(), handleDeleteDamaged()

### Community 10 - "Community 10"
Cohesion: 0.2
Nodes (6): deleteCustomer(), fetchCustomers(), handleDeleteConfirm(), handleSaveCustomer(), insertCustomer(), updateCustomer()

### Community 11 - "Community 11"
Cohesion: 0.28
Nodes (4): attemptLogin(), handlePinInput(), handleSubmit(), login()

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (4): generateInvoiceNumber(), generateTransferNumber(), handleExecuteTransfer(), transferStock()

### Community 13 - "Community 13"
Cohesion: 0.83
Nodes (3): allocateDiscountByUnits(), getEffectiveLineTotal(), round2()

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (2): buildProductRevenueStats(), getTopRevenueAndQuantityProducts()

## Knowledge Gaps
- **Thin community `Community 17`** (3 nodes): `buildProductRevenueStats()`, `getTopRevenueAndQuantityProducts()`, `revenue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `loadAll()` connect `Community 3` to `Community 0`, `Community 1`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.234) - this node is a cross-community bridge._
- **Why does `isUuid()` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `parseBusinessDate()` connect `Community 5` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `loadAll()` (e.g. with `fetchBranches()` and `fetchProductsWithStock()`) actually correct?**
  _`loadAll()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `isUuid()` (e.g. with `addBranch()` and `addProduct()`) actually correct?**
  _`isUuid()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `parseBusinessDate()` (e.g. with `isInPeriod()` and `isInPeriod()`) actually correct?**
  _`parseBusinessDate()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `extractDbErrorMessage()` (e.g. with `loadAll()` and `getProductSalesUsage()`) actually correct?**
  _`extractDbErrorMessage()` has 5 INFERRED edges - model-reasoned connections that need verification._