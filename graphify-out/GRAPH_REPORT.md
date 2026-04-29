# Graph Report - hoard-lavish-erp-main  (2026-04-23)

## Corpus Check
- 32 files · ~1,623,113 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 301 nodes · 416 edges · 11 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `loadAll()` - 17 edges
2. `isUuid()` - 10 edges
3. `parseBusinessDate()` - 9 edges
4. `isUuid()` - 8 edges
5. `extractDbErrorMessage()` - 7 edges
6. `makeUuid()` - 7 edges
7. `handleAddToCart()` - 5 edges
8. `printReceiptForSale()` - 5 edges
9. `addCustomer()` - 5 edges
10. `completeSale()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `completeSale()` --calls--> `generateInvoiceNumber()`  [INFERRED]
  context\StoreContext.tsx → utils\generators.ts
- `isInPeriod()` --calls--> `parseBusinessDate()`  [INFERRED]
  components\Accounting.tsx → utils\dateTime.ts
- `handleSave()` --calls--> `updateBranch()`  [INFERRED]
  components\Branches.tsx → services\supabaseService.ts
- `handleSaveCustomer()` --calls--> `addCustomer()`  [INFERRED]
  components\Customers.tsx → context\StoreContext.tsx
- `isSaleEditable()` --calls--> `parseBusinessDate()`  [INFERRED]
  components\Dashboard.tsx → utils\dateTime.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (44): loadAll(), asUuidOrNull(), completeSaleRPC(), deleteDamagedGood(), deleteDamagedGoodByRecord(), fetchBranches(), fetchBrands(), fetchCategories() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (33): handleSaveExpense(), handleSave(), handleDeleteRequest(), handleSaveProduct(), handleSyncAll(), handleCreateCustomer(), addBranch(), addCustomer() (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (28): calculateCartTotals(), allocateDiscountByUnits(), fmtCurrency(), getEffectiveLineTotal(), getMountLaviniaDefaultPrinter(), getThermalPrinterName(), handleAddToCart(), handleBarcodeSubmit() (+20 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (13): generateInvoiceNumber(), generateTransferNumber(), handleConfirmVariationPrint(), handleDeleteConfirm(), handleDeleteKeepSales(), handleDeleteWithSales(), handleExecuteTransfer(), handlePrintBarcode() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (11): isInPeriod(), fmtCurrency(), generateDayEndReport(), isSaleEditable(), timeAgo(), parseBusinessDate(), generateTransferPDF(), fmtCurrency() (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (13): getThermalPrinterForBranch(), handleCSVFileChange(), handleExport(), handleSaveGeneral(), handleSaveUser(), isMountLaviniaBranch(), normalizeBranchName(), processCSVFile() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (9): addSupplier(), recordSupplierExpense(), deleteSupplier(), deleteSupplierTransaction(), updateSupplier(), handleDeleteConfirm(), handleDeleteTransaction(), handleSaveSupplier() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (4): handleDeleteConfirm(), handleSaveCustomer(), deleteCustomer(), updateCustomer()

### Community 8 - "Community 8"
Cohesion: 0.28
Nodes (4): attemptLogin(), handlePinInput(), handleSubmit(), login()

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (2): sqlText(), sqlUuidOrNull()

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (2): buildProductRevenueStats(), getTopRevenueAndQuantityProducts()

## Knowledge Gaps
- **Thin community `Community 10`** (5 nodes): `getBusinessDate()`, `sqlNum()`, `sqlText()`, `sqlUuidOrNull()`, `offline-sales-recovery.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (3 nodes): `buildProductRevenueStats()`, `getTopRevenueAndQuantityProducts()`, `revenue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parseBusinessDate()` connect `Community 4` to `Community 2`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `loadAll()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `completeSale()` connect `Community 2` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `loadAll()` (e.g. with `fetchBranches()` and `fetchProductsWithStock()`) actually correct?**
  _`loadAll()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `parseBusinessDate()` (e.g. with `isInPeriod()` and `isSaleEditable()`) actually correct?**
  _`parseBusinessDate()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._