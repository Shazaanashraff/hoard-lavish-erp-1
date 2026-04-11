# Hoard Lavish ERP Unit Testing Strategy

## Purpose
This document is the unit testing strategy for the Hoard Lavish ERP application only.

It is written as a practical handoff for developers and QA, with enough detail for an intern to execute and enough rigor for a senior engineer to trust.

The recommended test stack is Vitest plus React Testing Library.

This strategy assumes the helper refactor target described in [MIGRATION_HELPERS.md](MIGRATION_HELPERS.md) is the desired code shape. The cleanest unit-test surface is the one where validation, payload creation, transformation, and error handling live in focused helper modules instead of large component and context files.

## Testing Goal
The goal is to prove that ERP business logic works correctly in isolation, without requiring:

- Live Supabase backend connectivity.
- Real-time network sockets.
- Full browser end-to-end test flows.
- Real OS printer availability.

Unit tests should answer these questions:

- Does each helper return the right output for a given input?
- Does the page submit the correct payload when the user confirms an action?
- Does service logic map backend rows into safe app models correctly?
- Does UI show the right validation and error state for invalid input?
- Do derived values in dashboard, accounting, and history match source records?

## Recommended Scope

### In Scope

- Pure helper functions.
- Store and service-level transformation logic.
- Validation rules and payload builders.
- Date/time normalization and financial calculations.
- Query and fallback behavior in service methods.
- Auth and role guard logic.
- Offline queue decision and message shaping logic.
- Small React component behavior tested with RTL and mocks.

### Out of Scope

- Live database integration and production schema behavior.
- Real network latency and true socket transport behavior.
- End-to-end multi-page workflows.
- Visual correctness of chart rendering beyond logic output.
- Database engine constraints and transaction isolation guarantees.

## Recommended Tooling Standard

Use the following baseline:

- vitest for running tests.
- @testing-library/react for component tests.
- @testing-library/user-event for realistic user interactions.
- @testing-library/jest-dom for readable DOM assertions.

Recommended supporting mocks:

- Mock Supabase client methods for service tests.
- Mock localStorage for auth/session/offline tests.
- Mock react-router-dom only where route redirection behavior must be asserted.
- Mock window.electronAPI for printer/update shell behavior.
- Mock Date.now and Date parsing where time windows matter.
- Mock window.prompt for destructive review/confirmation flows.

## Testing Philosophy

### 1. Test Behavior, Not Implementation Detail
Test outcomes and contracts, not hook ordering or internal state names.

### 2. Prefer Small and Focused Tests
Each test should verify one rule. If setup is large, split logic into helper units.

### 3. Keep Pure Logic Pure
Validation, normalization, and transformation should be tested as plain functions without React rendering.

### 4. Use RTL Only Where UI Contract Matters
Use RTL for form submit wiring, validation visibility, dialog behavior, loading/error states, and derived output display.

### 5. Treat Edge Cases as First-Class Cases
ERP risk areas include discounts, split payments, stock transfers, timestamps, offline queue retries, and migration fallbacks.

## Test Architecture by Layer

### Layer 1: Shared Utilities and Core Helpers

Primary files:

- [utils/cart.ts](../../utils/cart.ts)
- [utils/dateTime.ts](../../utils/dateTime.ts)
- [utils/formatters.ts](../../utils/formatters.ts)
- [utils/generators.ts](../../utils/generators.ts)
- [utils/permissions.ts](../../utils/permissions.ts)

What to test:

- Financial total calculations and discount caps.
- Currency formatting and null safety.
- Date normalization with timezone suffixes.
- Invoice and transfer number generation patterns.
- Role permission decisions and deny-by-default behavior.

Why this matters:

- These are shared foundations and fastest risk-reduction targets.

### Layer 2: Domain and Service Logic

Primary files:

- [services/supabaseService.ts](../../services/supabaseService.ts)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [services/geminiService.ts](../../services/geminiService.ts)

What to test:

- Mapper safety and field coercion.
- Payload shaping for sales, exchange, supplier, stock operations.
- Error extraction and fallback messaging.
- Connectivity and queueability decisions.
- Offline queue operation labeling and decision logic.

Why this matters:

- This layer is where business behavior and data contracts converge.

### Layer 3: RTL Component Tests for UI Wiring

Primary files:

- [components/POS.tsx](../../components/POS.tsx)
- [components/Inventory.tsx](../../components/Inventory.tsx)
- [components/Suppliers.tsx](../../components/Suppliers.tsx)
- [components/Settings.tsx](../../components/Settings.tsx)
- [components/Dashboard.tsx](../../components/Dashboard.tsx)
- [components/SalesHistory.tsx](../../components/SalesHistory.tsx)
- [components/Accounting.tsx](../../components/Accounting.tsx)
- [components/LoginPage.tsx](../../components/LoginPage.tsx)
- [App.tsx](../../App.tsx)

What to test:

- Submit triggers correct domain call path.
- Invalid input shows expected message and blocks submit.
- Dialog state and selection state transitions.
- Correct rendering of derived numbers and labels.
- Error and loading states remain visible and understandable.

Why this matters:

- Confirms UI is correctly wired to validated logic without retesting all pure helper behavior.

## Test Coverage Plan by Area

## 1. Utility and Calculation Logic

Target files:

- [utils/cart.ts](../../utils/cart.ts)
- [utils/formatters.ts](../../utils/formatters.ts)
- [utils/dateTime.ts](../../utils/dateTime.ts)
- [utils/generators.ts](../../utils/generators.ts)
- [utils/permissions.ts](../../utils/permissions.ts)

Primary goals:

- Verify deterministic output for pure functions.
- Validate numeric safety and null safety.
- Guard business-rule boundaries around discount and totals.

Core test cases:

- calculateCartTotals computes subtotal, tax, discount, total, and totalCost correctly.
- Discount is capped so payable total cannot go below zero.
- fmtCurrency handles null, undefined, NaN, negative, and large values safely.
- parseBusinessDate strips timezone suffix and preserves local wall-clock interpretation.
- generateInvoiceNumber and generateTransferNumber follow expected format.
- Role helper functions return false for missing roles by default.

Edge cases to include:

- Empty cart with non-zero discount.
- Discount greater than subtotal plus tax.
- Tax rate zero and malformed values.
- Date strings with Z, +05:30, -04:00 offsets.
- Permission checks with undefined, blank, or invalid role values.

## 2. API and Mapper Contract Logic

Target file:

- [services/supabaseService.ts](../../services/supabaseService.ts)

Primary goals:

- Validate mapping logic from DB rows to app models.
- Validate fallback behavior when optional columns and tables are missing.
- Validate payload shape for RPC and insert/update methods.

Core test cases:

- mapProduct, mapCustomer, mapSale, mapExchange, mapStockMovement, mapSupplier, mapSupplierTransaction, mapExpense, mapUser, mapSettings return safe normalized objects.
- UUID guards accept valid UUID and reject malformed values.
- Printer resolution uses configured value first and default fallback otherwise.
- completeSaleRPC handles split payment parameters and fallback paths.
- voidSaleRPC returns expected failures for missing function cases.
- Missing-column and missing-table detection branches execute expected fallback behavior.

Edge cases to include:

- Row fields present as strings for numeric columns.
- Null product_id in sale items.
- Missing optional columns such as affects_accounting.
- Missing stock_transfers table behavior.
- Empty errors array and malformed backend error payloads.

## 3. Auth, Shell, and Role Guard Logic

Target files:

- [App.tsx](../../App.tsx)
- [components/LoginPage.tsx](../../components/LoginPage.tsx)
- [utils/permissions.ts](../../utils/permissions.ts)
- [services/supabaseClient.ts](../../services/supabaseClient.ts)

Primary goals:

- Confirm login flow and role guard behavior are safe.
- Confirm missing credentials and malformed session paths do not crash app.

Core test cases:

- Login attempt accepts valid PIN and rejects invalid PIN.
- App route guards block forbidden views by role.
- Missing Supabase env does not crash and warning path remains stable.
- Logout/session reset behavior returns app to login shell.

Edge cases to include:

- PIN blank, less than 4 chars, more than 4 chars.
- Role missing on current user.
- Session object exists but has malformed fields.

## 4. POS and Checkout Logic

Target files:

- [components/POS.tsx](../../components/POS.tsx)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [utils/cart.ts](../../utils/cart.ts)

Primary goals:

- Validate checkout calculations and payment-mode behavior.
- Validate exchange pricing and settlement logic.
- Validate barcode and SKU matching behavior.

Core test cases:

- round2 and discount allocation logic produce balanced totals.
- getEffectiveLineTotal handles return/new/no-sale-return scenarios correctly.
- Checkout blocks invalid split payment combinations.
- addToCart and updateCartQuantity enforce available stock constraints.
- completeSale and updateSale produce consistent inventory and customer deltas.
- Exchange settlement type and difference calculation remain correct.

Edge cases to include:

- Discount with repeating decimal allocation.
- Split payment where cash plus card does not equal total.
- Item-level discount exceeds line price.
- Barcode values containing whitespace and duplicate match situations.
- Exchange with missing original route or mixed item source types.

RTL component test ideas:

- Simulate item add and checkout with mocked store methods.
- Verify invalid discount and invalid payment split warnings are visible.
- Verify exchange dialog state and settlement result display.

## 5. Inventory, Transfers, and Stock Logic

Target files:

- [components/Inventory.tsx](../../components/Inventory.tsx)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)

Primary goals:

- Validate stock movement logic and transfer consistency.
- Validate barcode generation and printing helper behavior.

Core test cases:

- generateBarcode creates valid check-digit sequence.
- adjustStock applies delta and logs movement type safely.
- transferStock validates quantity and branch transitions.
- Transfer history refresh and view model calculations remain accurate.

Edge cases to include:

- Quantity zero and negative quantity.
- Transfer where source and destination branch are same.
- Product missing branch stock key.
- Barcode collisions and invalid manual entry handling.

RTL component test ideas:

- Add transfer item, change quantity, and verify expected submit call.
- Submit invalid adjustment and verify visible validation.

## 6. Suppliers and Accounting Logic

Target files:

- [components/Suppliers.tsx](../../components/Suppliers.tsx)
- [components/Accounting.tsx](../../components/Accounting.tsx)
- [context/StoreContext.tsx](../../context/StoreContext.tsx)

Primary goals:

- Validate supplier transaction payload shaping and accounting impact handling.
- Validate profit/expense aggregation windows.

Core test cases:

- Supplier transaction note parser keeps readable line rendering.
- Supplier transaction create/update/delete payloads remain consistent.
- affectsAccounting fallback behavior remains safe when backend column absent.
- Accounting period filters include valid records and exclude out-of-range values.
- Profit and expense aggregates remain stable under partial datasets.

Edge cases to include:

- Empty notes, multiline notes, malformed line formats.
- Null supplier IDs or missing supplier names.
- Partial date ranges and invalid date strings.
- Zero-value and negative-value expense lines.

RTL component test ideas:

- Approve supplier expense flow and verify expected payload path.
- Verify accounting cards/charts update when filter period changes.

## 7. Dashboard and Sales History Derived Logic

Target files:

- [components/Dashboard.tsx](../../components/Dashboard.tsx)
- [components/SalesHistory.tsx](../../components/SalesHistory.tsx)
- [components/Branches.tsx](../../components/Branches.tsx)

Primary goals:

- Validate derived metrics, item aggregations, and filtering logic.

Core test cases:

- Date and month match functions include expected records.
- Top performer aggregation and summary cards are deterministic.
- SalesHistory period filters (today/week/month/custom) work correctly.
- Item-wise stats and grouped totals match source sales and exchange records.
- Branch stats totals and values are accurate.

Edge cases to include:

- Empty histories.
- Invalid or timezone-shifted timestamps.
- Duplicate items across multiple sales records.
- Branch filter with no matching sales.

RTL component test ideas:

- Render dashboard with mocked datasets and verify cards/charts labels.
- Verify custom range in SalesHistory filters and updates displayed rows.

## 8. Offline Queue and Resilience Logic

Target files:

- [context/StoreContext.tsx](../../context/StoreContext.tsx)
- [components/OfflineQueue.tsx](../../components/OfflineQueue.tsx)
- [App.tsx](../../App.tsx)
- [scripts/offline-sales-recovery.js](../../scripts/offline-sales-recovery.js)
- [scripts/supplier-expense-recovery.js](../../scripts/supplier-expense-recovery.js)

Primary goals:

- Validate queue decision logic, operation labels, and user feedback behavior.
- Validate recovery script helper behavior for safe SQL generation.

Core test cases:

- Connectivity issue classifier returns expected result for known error patterns.
- DB error extraction returns user-safe message by category.
- Queueable error detection path behaves consistently.
- Operation labels map to clear user-facing action names.
- Recovery scripts sanitize SQL strings and numeric values safely.

Edge cases to include:

- Unknown operation type.
- Malformed error objects with missing code/message.
- Retry count boundaries and stale queue entries.
- Invalid storage JSON for recovery scripts.

RTL component test ideas:

- Show queued popup and verify open-queue action path.
- Verify dbError banner retry and dismiss behavior.

## 9. Settings, CSV, and Printer Resolution Logic

Target files:

- [components/Settings.tsx](../../components/Settings.tsx)
- [components/POS.tsx](../../components/POS.tsx)
- [services/supabaseService.ts](../../services/supabaseService.ts)

Primary goals:

- Validate branch printer fallback and CSV parsing behavior.

Core test cases:

- normalizeBranchName and Mount-Lavinia detection behave consistently.
- getThermalPrinterForBranch and fallback behavior are deterministic.
- parseCSV handles quotes, commas, and empty rows safely.
- Import mapping rejects malformed rows and accepts valid rows.

Edge cases to include:

- Mixed-case branch names with symbols.
- CSV with trailing commas and blank lines.
- Missing required columns and unexpected headers.

## 10. Electron Bridge and Shell Operations Logic

Target files:

- [electron/main.cjs](../../electron/main.cjs)
- [electron/preload.cjs](../../electron/preload.cjs)

Primary goals:

- Validate event payload shaping and safe guard behavior.

Core test cases:

- sendToRenderer does not throw when window is missing.
- Update event payloads are consistent and complete.
- print options include expected defaults and page-size conditions.
- preload API exposes expected functions and listener cleanup behavior.

Edge cases to include:

- Missing printer name.
- Timeout path in print flow.
- Missing update event listener callbacks.

## Recommended Test File Structure

Use a single consistent pattern.

Option A, co-located tests:

- utils/cart.test.ts next to utils/cart.ts
- components/POS.test.tsx next to components/POS.tsx

Option B, dedicated test tree:

- tests/unit/utils/cart.test.ts
- tests/unit/components/POS.test.tsx

Recommendation:

- Use Option B for this repository to keep production folders clean.
- Keep helper tests grouped by domain and mirror source folders.

## Mocking Strategy

### Supabase

Mock method chains used by service methods and assert:

- Request shape.
- Error fallback path.
- Mapper output for known inputs.

### localStorage

Mock getItem, setItem, removeItem and test both:

- Valid data.
- Invalid JSON and missing keys.

### Time

Freeze time with Date.now mocks for:

- Generator helpers.
- History windows.
- Activity time labels.

### electronAPI

Mock window.electronAPI object to test:

- Update notification handlers.
- Print helpers.
- Listener cleanup behavior.

### window.prompt and window.alert

Mock to deterministic values for review/confirm flows.

## Suggested Edge Case Checklist

These cases should be explicit in test naming and planning:

- Empty string vs null vs undefined.
- Whitespace-only input.
- Zero numeric values vs missing numeric values.
- Decimal numbers supplied as strings.
- Boolean values passed as strings.
- Malformed JSON in storage.
- Partial backend responses.
- Empty, singleton, and large arrays.
- Unsupported filter keys.
- Error payload variants (message, msg, errors).
- Time window boundaries and timezone suffixes.

## User-Facing Error Message Guidance

Use short, actionable UI messages and log technical details separately.

Recommended message patterns:

- Checkout split mismatch: Cash and card amounts must equal the total.
- Missing stock: Not enough stock to complete this action. Refresh and retry.
- Offline queued: Connection issue detected. Action saved to offline queue.
- Missing migration RPC: This operation requires a database migration. Contact admin.
- Validation error: Please correct highlighted fields and submit again.
- Unknown failure: Something went wrong. Please retry. If it continues, contact support.

Log-side expectations:

- Include operation name, relevant IDs, backend code, and original error payload.
- Avoid exposing raw backend stack messages to end users.

## Coverage Priority Order

If the team implements tests in phases, use this order:

1. Shared utility and permission helpers.
2. Service mappers and request/error fallback logic.
3. StoreContext pure decision and transformation logic.
4. POS pricing, exchange, and inventory helper logic.
5. Dashboard, sales history, and accounting derived metrics.
6. RTL page wiring tests for major screens.
7. Electron bridge and script utility tests.

This order gives fastest risk reduction by stabilizing the most reused logic first.

## What Good Looks Like

A strong unit test suite for this ERP has these properties:

- Business rules are understandable from test names alone.
- Pure helpers have direct success and failure coverage.
- Page tests verify wiring and visible behavior only.
- Test failures isolate one behavior quickly.
- Refactors are safe because tests anchor contract-level behavior.

## Suggestions to Make This Excellent

1. Extract shared helpers before writing most component tests.
2. Create one fixture factory per domain (sales, product, supplier, branch, exchange).
3. Standardize assertion style across teams.
4. Keep validation messages stable and human-readable.
5. Keep most logic coverage in helper tests, not page tests.
6. Put edge case intent directly in test names.
7. Use one source of truth for sample entities.
8. Freeze time for date-window-sensitive tests.
9. Mock network at service boundaries, not at page level.
10. Split success-path and failure-path test blocks.

## Source Coverage Checklist

This strategy covers unit-test planning for all source areas with logic:

- [App.tsx](../../App.tsx)
- [index.tsx](../../index.tsx)
- [constants.ts](../../constants.ts)
- [types.ts](../../types.ts)
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

## Final Recommendation

For this codebase, the best unit testing strategy is:

- Use Vitest for the test runner.
- Use React Testing Library for page-level behavior that remains after helper extraction.
- Move as much business logic as possible into pure helpers.
- Test helpers first, then add focused component wiring tests.
- Keep user-facing error messages safe and actionable while preserving technical details in logs.

This gives the best balance of speed, clarity, and long-term maintainability for Hoard Lavish ERP.

## Implementation Note

This is a strategy document only. It does not create tests or modify source behavior.
