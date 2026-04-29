# Project Structure — Hoard Lavish ERP

Post-refactor folder layout. Every path is relative to the project root.

---

## Root

```
hoard-lavish-erp-main/
├── index.tsx               Entry point — mounts React app
├── App.tsx                 Top-level router (ViewState switch)
├── types.ts                All shared TypeScript types/interfaces
├── constants.ts            Seed data, static lookup tables, CUR symbol
├── vite-env.d.ts           Global type declarations (__APP_VERSION__, ElectronAPI)
├── vite.config.ts          Vite + Vitest config
├── vitest.setup.ts         Empty vitest global setup
├── package.json
└── electron/               Electron main process files
```

---

## `context/`

```
context/
└── StoreContext.tsx        Single React context provider. Owns ALL app state and
                            domain actions. Imports exclusively from services/db/*.
                            Do not split without understanding cross-domain coupling.
```

---

## `components/`

```
components/
├── shared/                 Reusable primitives — import from here, never define locally
│   ├── ConfirmDialog.tsx   Delete/confirm modal (title, message, onConfirm, onCancel)
│   ├── AlertPopup.tsx      Error/warning banner (message, type, onClose)
│   └── TabButton.tsx       Generic tab pill, typed on the tab id union
│
├── POS/                    Point-of-sale feature
│   ├── index.tsx           Full POS screen — cart, checkout, exchange flow
│   └── posUtils.ts         Pure math: round2, allocateDiscountByUnits, getEffectiveLineTotal
│
├── Inventory/
│   └── index.tsx           Product CRUD, stock adjustments, transfers, barcode printing
│
├── Dashboard/
│   └── index.tsx           Sales analytics, charts, sale editing/voiding, PDF export
│
├── Accounting.tsx          Expense entry and history
├── Customers.tsx           Customer CRUD and loyalty tracking
├── Suppliers.tsx           Supplier CRUD, transactions, damaged goods tab
├── Settings.tsx            App settings, branch management, CSV import
├── LoginPage.tsx           PIN login screen
└── SalesHistory.tsx        Read-only sales ledger
```

---

## `services/`

```
services/
├── supabaseClient.ts       Supabase JS client singleton
├── supabaseService.ts      Barrel re-export of all services/db/* modules
│                           (keeps existing `import * as db from '../services/supabaseService'` working)
├── geminiService.ts        Google Gemini AI integration
└── db/                     Domain-split database layer — one file per entity
    ├── shared.ts           UUID helpers (UUID_PATTERN, asUuidOrNull) + SupabaseErrorLike type
    ├── branches.ts         fetchBranches, insertBranch, updateBranch
    ├── products.ts         mapProduct, fetchProductsWithStock, insertProduct, updateProduct, deleteProduct
    ├── customers.ts        mapCustomer, fetchCustomers, insertCustomer, updateCustomer, deleteCustomer
    ├── sales.ts            completeSaleRPC, voidSaleRPC, mapSale, fetchSales,
    │                       mapExchange, fetchExchanges, insertExchange
    ├── stockMovements.ts   mapStockMovement, fetchStockMovements, insertStockMovement, upsertBranchStock
    ├── suppliers.ts        Full supplier + transaction CRUD; backwards-compatible affects_accounting column
    ├── expenses.ts         mapExpense, fetchExpenses, insertExpense, deleteExpense
    ├── users.ts            mapUser, fetchUsers, insertUser, updateUser, deleteUser
    ├── settings.ts         mapSettings, fetchSettings, updateSettings, fetchCategories, fetchBrands
    ├── inventory.ts        fetchDamagedGoods, insertDamagedGood, deleteDamagedGood, initializeBranchStock
    └── transfers.ts        fetchStockTransfers, insertStockTransfer
```

---

## `utils/`

```
utils/
├── formatters.ts           fmtCurrency — single source of truth for LKR display formatting
├── ids.ts                  isUuid, makeUuid — UUID validation and generation
├── errors.ts               isLikelyConnectivityIssue, extractDbErrorMessage, DbLikeError type
├── branch.ts               normalizeBranchName, isMountLaviniaBranch,
│                           getThermalPrinterForBranch, MOUNT_LAVINIA_DEFAULT_PRINTER
├── csv.ts                  parseCSV, CSV_COLUMNS, CSV_REQUIRED, CSV_SAMPLE
├── cart.ts                 calculateCartTotals
├── dateTime.ts             parseBusinessDate and date helpers
├── generators.ts           generateInvoiceNumber, generateTransferNumber
└── revenue.ts              buildProductRevenueStats, getTopRevenueAndQuantityProducts
```

---

## `hooks/`

```
hooks/
├── useModal.ts             Generic open/close/data hook for modals
└── usePrinter.ts           Resolves thermal and barcode printer names per branch
                            using Electron's printer list
```

---

## `docs/`

```
docs/
├── architecture.md         System architecture, domain model, critical constraints,
│                           and AI-agent guardrails
└── optimisation/           Performance analysis reports (non-critical, reference only)
    ├── analysis.md
    ├── pos-optimisation.md
    └── stock-transfer-analysis.md
```

---

## `tests/`

```
tests/
└── fixtures/
    └── data.ts             Shared test data factories (makeSale, cartItemGown, cartItemLoafers)
```

---

## Naming conventions

| What | Convention | Example |
|------|-----------|---------|
| React components | PascalCase file, default export | `ConfirmDialog.tsx` |
| Feature folders | PascalCase, `index.tsx` as entry | `components/POS/index.tsx` |
| Utility files | camelCase | `utils/formatters.ts` |
| Hook files | camelCase, `use` prefix | `hooks/useModal.ts` |
| DB service files | camelCase, entity noun | `services/db/products.ts` |
| Types | PascalCase interfaces | `Product`, `SalesRecord` |

---

## Key rules (enforced across the codebase)

- **Never define `fmtCurrency` inline** — always import from `utils/formatters.ts`
- **Never define `ConfirmDialog`, `AlertPopup`, `TabButton` locally** — import from `components/shared/`
- **Never query Supabase from components** — always go through `useStore()` actions
- **Branch stock is the source of truth** — `product.stock` is display only; read from `product.branchStock[branchId]`
- **Sale creation is RPC-only** — `fn_complete_sale` runs atomically in Postgres; do not replicate in JS
- **Damaged goods delete = stock restore** — deleting a record must increment branch stock (inverse of insert)
- **Connectivity errors must be queued** — call `enqueueOfflineOperation`, never silently discard
