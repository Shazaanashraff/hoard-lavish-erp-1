# Hoard Lavish ERP Helper Refactor Plan

## Purpose
This document is a handoff plan for extracting page-local and context-heavy logic into reusable helper modules.

The goal is to make ERP logic easier to test, easier to review, and less dependent on large files with mixed UI, state, validation, and payload shaping.

This plan is limited to this repository and complements [UNIT_TESTING_README.md](UNIT_TESTING_README.md).

## Scope Statement
This is a planning and architecture document.

- No helper files are created in this phase.
- No tests are created in this phase.
- No source behavior is changed in this phase.

## What Should Move Out of Large Files

Current large files contain three logic types that should be extracted:

1. Validation and decision logic.
2. Payload normalization and transformation logic.
3. Derived view-model shaping logic.

Primary extraction sources:

- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [components/POS.tsx](../../components/POS.tsx)
- [components/Inventory.tsx](../../components/Inventory.tsx)
- [components/Dashboard.tsx](../../components/Dashboard.tsx)
- [components/SalesHistory.tsx](../../components/SalesHistory.tsx)
- [components/Accounting.tsx](../../components/Accounting.tsx)
- [components/Settings.tsx](../../components/Settings.tsx)
- [components/Suppliers.tsx](../../components/Suppliers.tsx)
- [services/supabaseService.ts](../../services/supabaseService.ts)
- [App.tsx](../../App.tsx)

## Recommended Helper Folder Structure

Keep the existing utils and services roots, and expand by domain.

```text
utils/
  math/
    rounding.ts
    discounts.ts
    totals.ts
  validation/
    email.ts
    numbers.ts
    uuid.ts
    coordinates.ts
  errors/
    connectivity.ts
    dbMessages.ts
    dbGuards.ts
  branch/
    branchName.ts
    printers.ts
  barcode/
    ean13.ts
    search.ts
  analytics/
    periods.ts
    aggregations.ts
  exchange/
    lineTotals.ts
  csv/
    parser.ts

services/
  mappers/
    productMapper.ts
    customerMapper.ts
    saleMapper.ts
    exchangeMapper.ts
    stockMapper.ts
    supplierMapper.ts
    expenseMapper.ts
    userMapper.ts
    settingsMapper.ts
  payloads/
    salesPayloads.ts
    exchangePayloads.ts
    supplierPayloads.ts
    transferPayloads.ts
  viewmodels/
    dashboardViewModel.ts
    salesHistoryViewModel.ts
    accountingViewModel.ts
    operationsViewModel.ts
  offline/
    queueRules.ts
    operationLabels.ts
    retryPolicy.ts
```

## Helper Design Rules

- Keep helpers pure whenever possible.
- Helpers should not read or write React state directly.
- Helpers should not call setState, navigate, prompt, or alert.
- Helpers should return structured data, not JSX.
- Side effects should remain in thin orchestration layers.
- Validation helpers should return structured error results.
- Payload builders should produce backend-ready payload objects in one place.
- View-model helpers should shape data for table/card/chart rendering.

## Shared Logic to Centralize First

These behaviors are currently duplicated or tightly coupled and should be centralized early:

- Branch-name normalization and Mount-Lavinia printer fallback.
- Currency formatting variants across multiple components.
- DB error extraction and connectivity classification.
- UUID and token-like input validation.
- Date-period matching and grouping logic.
- Discount distribution and line-total calculations.
- CSV parsing behavior in settings import.

## File-by-File Migration Inventory

## 1. Service Contract and Mapper Layer

Source file:

- [services/supabaseService.ts](../../services/supabaseService.ts)

Recommended migration targets:

- isUuid, asUuidOrNull -> utils/validation/uuid.ts
- normalizeBranchName -> utils/branch/branchName.ts
- getDefaultThermalPrinterForBranch, resolveThermalPrinterName -> utils/branch/printers.ts
- isMissingSupplierAccountingColumnError, isMissingTableError -> utils/errors/dbGuards.ts
- mapProduct -> services/mappers/productMapper.ts
- mapCustomer -> services/mappers/customerMapper.ts
- mapSale -> services/mappers/saleMapper.ts
- mapExchange -> services/mappers/exchangeMapper.ts
- mapStockMovement -> services/mappers/stockMapper.ts
- mapSupplier, mapSupplierTransaction -> services/mappers/supplierMapper.ts
- mapExpense -> services/mappers/expenseMapper.ts
- mapUser -> services/mappers/userMapper.ts
- mapSettings -> services/mappers/settingsMapper.ts
- completeSaleRPC payload shaping branches -> services/payloads/salesPayloads.ts
- voidSaleRPC fallback decision logic -> services/payloads/salesPayloads.ts

Rationale:

- This file combines transport, mapping, validation, fallback behavior, and domain rules.
- Splitting by mapper/payload/guard reduces regression risk and improves testability.

## 2. StoreContext Core Orchestration

Source file:

- [context/StoreContext.tsx](../../context/StoreContext.tsx)

Recommended Phase 1 migration targets (pure and reusable):

- isSupabaseConfigured -> utils/validation/environment.ts
- isLikelyConnectivityIssue -> utils/errors/connectivity.ts
- extractDbErrorMessage -> utils/errors/dbMessages.ts
- isUuid, makeUuid -> utils/validation/uuid.ts
- operationLabel mapping -> services/offline/operationLabels.ts
- isQueueableError -> services/offline/queueRules.ts

Recommended Phase 2 migration targets (transactional and stateful):

- addToCart, updateCartQuantity, updateCartItemDiscount -> services/payloads/salesPayloads.ts plus services/viewmodels/cartViewModel.ts
- completeSale -> services/payloads/salesPayloads.ts plus services/offline/retryPolicy.ts
- updateSale -> services/payloads/salesPayloads.ts
- deleteSale -> services/payloads/salesPayloads.ts
- completeExchange -> services/payloads/exchangePayloads.ts
- adjustStock -> services/payloads/transferPayloads.ts
- transferStock -> services/payloads/transferPayloads.ts
- recordSupplierExpense -> services/payloads/supplierPayloads.ts
- runOfflineOperation and executeWithOfflineQueue decision logic -> services/offline/queueRules.ts

Rationale:

- StoreContext is the largest logic cluster and should be split by pure logic first.
- Transactional extraction should be staged after payload contracts are stable.

## 3. POS Page Logic

Source file:

- [components/POS.tsx](../../components/POS.tsx)

Recommended Phase 1 migration targets:

- round2 -> utils/math/rounding.ts
- allocateDiscountByUnits -> utils/math/discounts.ts
- getEffectiveLineTotal -> utils/exchange/lineTotals.ts
- processBarcodeValue matching logic -> utils/barcode/search.ts
- printer fallback helpers -> utils/branch/printers.ts

Recommended Phase 2 migration targets:

- handleBillDiscountChange and handleItemDiscountChange rule logic -> utils/math/discounts.ts
- exchange settlement computation paths -> services/payloads/exchangePayloads.ts
- receipt model shaping before print -> services/viewmodels/receiptViewModel.ts

Rationale:

- POS contains high-risk pricing logic and should move to pure functions in controlled phases.

## 4. Inventory Page Logic

Source file:

- [components/Inventory.tsx](../../components/Inventory.tsx)

Recommended migration targets:

- generateBarcode -> utils/barcode/ean13.ts
- filteredProducts and stock filter logic -> services/viewmodels/inventoryViewModel.ts
- transfer list manipulation logic -> services/payloads/transferPayloads.ts
- transfer PDF model shaping -> services/viewmodels/transferReportViewModel.ts

Rationale:

- Barcode and transfer helpers are reusable and should not remain embedded in UI handlers.

## 5. Dashboard and Sales History Logic

Source files:

- [components/Dashboard.tsx](../../components/Dashboard.tsx)
- [components/SalesHistory.tsx](../../components/SalesHistory.tsx)
- [components/Branches.tsx](../../components/Branches.tsx)

Recommended migration targets:

- matchesDate, matchesMonth, isInPeriod -> utils/analytics/periods.ts
- Top performer aggregation -> utils/analytics/aggregations.ts
- Day-end report data shaping -> services/viewmodels/dashboardViewModel.ts
- Sales/item aggregation and stats -> services/viewmodels/salesHistoryViewModel.ts
- Branch stats calculation -> services/viewmodels/branchViewModel.ts

Rationale:

- Derived analytics should be deterministic helpers, not repeated inline transforms.

## 6. Accounting and Supplier Logic

Source files:

- [components/Accounting.tsx](../../components/Accounting.tsx)
- [components/Suppliers.tsx](../../components/Suppliers.tsx)

Recommended migration targets:

- Accounting period and totals aggregation -> services/viewmodels/accountingViewModel.ts
- Supplier note parsing renderer prep -> services/viewmodels/supplierViewModel.ts
- Supplier expense payload shaping -> services/payloads/supplierPayloads.ts
- Damaged goods payload normalization -> services/payloads/supplierPayloads.ts

Rationale:

- Profit and supplier impact calculations are business-critical and need explicit helper boundaries.

## 7. Settings and Login Logic

Source files:

- [components/Settings.tsx](../../components/Settings.tsx)
- [components/LoginPage.tsx](../../components/LoginPage.tsx)
- [App.tsx](../../App.tsx)

Recommended migration targets:

- normalizeBranchName and printer resolution duplicates -> utils/branch/printers.ts
- parseCSV -> utils/csv/parser.ts
- login PIN validation -> utils/validation/pin.ts
- role guard matrix for view access -> services/viewmodels/roleGuardViewModel.ts

Rationale:

- Shared auth/printer/csv logic should not be repeated in page-level handlers.

## 8. Electron and Script Logic

Source files:

- [electron/main.cjs](../../electron/main.cjs)
- [electron/preload.cjs](../../electron/preload.cjs)
- [scripts/offline-sales-recovery.js](../../scripts/offline-sales-recovery.js)
- [scripts/supplier-expense-recovery.js](../../scripts/supplier-expense-recovery.js)

Recommended migration targets:

- update event payload normalization -> services/viewmodels/updateViewModel.ts
- print option normalization -> services/payloads/printPayloads.ts
- SQL escaping and numeric coercion helpers -> utils/validation/sqlSafe.ts
- business-date extraction helper in scripts -> utils/analytics/periods.ts

Rationale:

- Operational reliability improves when critical parsing/sanitization logic is centralized.

## Migration Phase Plan

### Phase 1: Pure and Reusable Helpers Only

Targets:

- Utility math, validation, error, branch/printer, barcode, csv parsing.
- Service mappers and pure payload builders.
- Date-period and analytics aggregation helpers.

Expected outcome:

- Immediate file-size reduction and high testability gain with low regression risk.

### Phase 2: Transactional and Stateful Logic

Targets:

- StoreContext transaction paths for sales, exchange, transfers, supplier flows.
- POS orchestration and settlement-heavy paths.
- Offline queue orchestration wrappers.

Expected outcome:

- Business-critical orchestration moves behind explicit contracts.

### Phase 3: Optional UI Cleanup

Targets:

- Remaining UI-only wrappers and repeated display helpers.
- Minor naming standardization and import hygiene.

Expected outcome:

- Cleaner pages with consistent thin-view pattern.

## Do-Not-Extract-Yet List

These blocks should remain in components/context until integration contracts are defined:

- Direct React dialog state transitions and local UI toggles.
- Immediate event wiring with browser APIs (keyboard listeners) where no stable abstraction exists yet.
- Complex multi-step action chains that still require side-effect ordering validation.

## Prioritized Implementation Order

1. Extract shared branch/printer, error, validation, and math helpers.
2. Extract service mappers and payload shaping helpers.
3. Extract dashboard, sales history, accounting view-model helpers.
4. Extract POS pricing and exchange pure logic.
5. Extract StoreContext pure decision logic.
6. Extract StoreContext transactional logic in staged slices.
7. Extract optional electron/script helper utilities.

This order maximizes safety by moving deterministic logic first.

## Acceptance Criteria

Refactor planning is considered complete when:

- Every high-value extraction target has a source-to-destination mapping.
- Phase 1 and Phase 2 boundaries are explicit and non-overlapping.
- Shared logic duplication hotspots are identified with one target owner.
- Do-not-extract-yet areas are documented to avoid unsafe moves.
- All major source modules are represented in this plan.

## User-Facing Error Message Guidance During Refactor

As helpers are extracted, preserve message quality with these contracts:

- Keep user messages concise and action-oriented.
- Keep technical details in logs and telemetry.
- Keep fallback message hierarchy deterministic.

Recommended message standards:

- Validation: Please correct highlighted fields.
- Connectivity: Connection issue detected. Action was queued offline.
- Authorization: Session expired. Please sign in again.
- Migration gap: Feature unavailable until required database migration is applied.
- Unknown: Something went wrong. Please retry.

## Developer Notes

- Prefer pure functions and narrow modules over one generic helper file.
- Do not move rendering concerns into helpers.
- Keep names domain-specific so ownership is obvious.
- If helper usage crosses pages, move to shared or domain root rather than duplicate.
- Keep contract behavior unchanged while moving logic.

## Relationship to Unit Testing Strategy

Use this document with [UNIT_TESTING_README.md](UNIT_TESTING_README.md):

- This file defines where logic should live.
- The testing strategy defines what should be verified and in what order.

## Source Coverage Checklist

This migration planning document includes extraction guidance for:

- [App.tsx](../../App.tsx)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [components/Accounting.tsx](../../components/Accounting.tsx)
- [components/Branches.tsx](../../components/Branches.tsx)
- [components/Customers.tsx](../../components/Customers.tsx)
- [components/Dashboard.tsx](../../components/Dashboard.tsx)
- [components/Inventory.tsx](../../components/Inventory.tsx)
- [components/LoginPage.tsx](../../components/LoginPage.tsx)
- [components/OfflineQueue.tsx](../../components/OfflineQueue.tsx)
- [components/POS.tsx](../../components/POS.tsx)
- [components/SalesHistory.tsx](../../components/SalesHistory.tsx)
- [components/Settings.tsx](../../components/Settings.tsx)
- [components/Sidebar.tsx](../../components/Sidebar.tsx)
- [components/Suppliers.tsx](../../components/Suppliers.tsx)
- [components/UpdateNotification.tsx](../../components/UpdateNotification.tsx)
- [services/geminiService.ts](../../services/geminiService.ts)
- [services/supabaseClient.ts](../../services/supabaseClient.ts)
- [services/supabaseService.ts](../../services/supabaseService.ts)
- [utils/cart.ts](../../utils/cart.ts)
- [utils/dateTime.ts](../../utils/dateTime.ts)
- [utils/formatters.ts](../../utils/formatters.ts)
- [utils/generators.ts](../../utils/generators.ts)
- [utils/permissions.ts](../../utils/permissions.ts)
- [electron/main.cjs](../../electron/main.cjs)
- [electron/preload.cjs](../../electron/preload.cjs)
- [scripts/offline-sales-recovery.js](../../scripts/offline-sales-recovery.js)
- [scripts/supplier-expense-recovery.js](../../scripts/supplier-expense-recovery.js)
- [scripts/recover-supplier-expense-2026-04-06.sql](../../scripts/recover-supplier-expense-2026-04-06.sql)
- [supabase/migrations/001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)
- [supabase/migrations/002_inventory_and_damaged_goods.sql](../../supabase/migrations/002_inventory_and_damaged_goods.sql)
- [supabase/migrations/002_remove_image_urls.sql](../../supabase/migrations/002_remove_image_urls.sql)
- [supabase/migrations/003_stock_transfers.sql](../../supabase/migrations/003_stock_transfers.sql)
- [supabase/migrations/004_add_barcode_fields.sql](../../supabase/migrations/004_add_barcode_fields.sql)
- [supabase/migrations/005_enable_realtime.sql](../../supabase/migrations/005_enable_realtime.sql)
- [supabase/migrations/006_branch_printer_names.sql](../../supabase/migrations/006_branch_printer_names.sql)
- [supabase/migrations/007_allow_unlinked_sale_items.sql](../../supabase/migrations/007_allow_unlinked_sale_items.sql)
- [supabase/migrations/008_cash_card_split_payments.sql](../../supabase/migrations/008_cash_card_split_payments.sql)
- [supabase/migrations/009_void_sale.sql](../../supabase/migrations/009_void_sale.sql)
- [supabase/migrations/010_exchange_persistence.sql](../../supabase/migrations/010_exchange_persistence.sql)
- [supabase/migrations/011_sale_item_variant_snapshots.sql](../../supabase/migrations/011_sale_item_variant_snapshots.sql)
- [supabase/migrations/012_mount_lavinia_default_thermal_printer.sql](../../supabase/migrations/012_mount_lavinia_default_thermal_printer.sql)
- [supabase/migrations/013_add_affects_accounting_to_supplier_transactions.sql](../../supabase/migrations/013_add_affects_accounting_to_supplier_transactions.sql)

## Implementation Note

This is a migration planning document only. It does not perform the refactor.
