# Architecture — Hoard Lavish ERP

## What this system is
A desktop ERP application for retail branch management. Handles POS (point-of-sale), inventory, customers, suppliers, accounting, and stock transfers across multiple branches. Built as an Electron desktop app with a React frontend backed by Supabase (PostgreSQL + realtime).

## Stack
| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| UI | React 19, TypeScript, Tailwind CSS |
| Build | Vite |
| Database | Supabase (PostgreSQL + realtime subscriptions) |
| PDF / Printing | jsPDF, jspdf-autotable, JsBarcode |
| Charts | Recharts |
| AI | Google Gemini (geminiService) |

## Top-level data flow

```
Electron (main.cjs)
  └─ Vite/React app (index.tsx → App.tsx)
       └─ StoreProvider (context/StoreContext.tsx)
            ├─ State: all domain data + offline queue
            ├─ Actions: all mutations
            └─ DB layer (services/db/*) ← Supabase
```

## Domain model

| Entity | Key invariants |
|--------|---------------|
| Branch | Every product has a stock row per branch (`product_branch_stock`). `currentBranch` scopes all POS and stock operations. |
| Product | Stock is per-branch, not global. `stock` field on Product is the sum of all branch stocks (display only). |
| Sale | Created via `fn_complete_sale` RPC (atomic). Items snapshot product details at sale time (name, SKU, price, cost). |
| Exchange | Separate table. Has RETURN and NEW item types. Adjusts stock on both sides. |
| Damaged Good | Reduces branch stock on insert, restores on delete. Both operations also record a `stock_movements` row. |
| Supplier Transaction | Has an `affects_accounting` column added in migration 013. The service layer has backwards-compatible fallback if the column is missing. |
| Stock Transfer | Optional feature (migration 003). Table availability is detected at runtime — operations silently no-op if table does not exist. |
| Offline Queue | Stored in `localStorage` (`hoard_offline_queue_v1`). Replayed via `syncOfflineQueue()` when connectivity returns. |

## Key modules

| Path | Purpose |
|------|---------|
| `context/StoreContext.tsx` | Single React context provider. Owns all app state and all domain actions. Imports from `services/db/*`. |
| `services/db/` | Domain-split DB layer. Each file owns one entity's CRUD + mapping. Barrel re-exported via `services/supabaseService.ts`. |
| `components/POS/` | Point-of-sale screen. Barcode scanner integration, cart, checkout, exchange flow. |
| `components/Inventory/` | Product CRUD, stock adjustments, transfers, variation builder, barcode printing. |
| `components/Dashboard/` | Sales analytics, charts, sale editing/deletion. |
| `components/shared/` | `ConfirmDialog`, `AlertPopup`, `TabButton` — reusable across all feature components. |
| `utils/errors.ts` | `isLikelyConnectivityIssue`, `extractDbErrorMessage` — DB error classification. |
| `utils/branch.ts` | `normalizeBranchName`, `isMountLaviniaBranch`, `getThermalPrinterForBranch`. |
| `utils/ids.ts` | `isUuid`, `makeUuid`. |
| `utils/formatters.ts` | `fmtCurrency` — single source of truth for LKR formatting. |
| `hooks/usePrinter.ts` | Electron printer list + thermal/barcode printer resolution per branch. |
| `hooks/useModal.ts` | Generic open/close/data state for modals. |

## Critical constraints

- **Never define `fmtCurrency` inline** — import from `utils/formatters.ts`.
- **`ConfirmDialog`, `AlertPopup`, `TabButton`** — import from `components/shared/`, never define locally.
- **Branch stock is the source of truth** — `product.stock` is derived, not stored. Always read from `product.branchStock[branchId]`.
- **Damaged goods delete = stock restore** — deleting a damaged record increments branch stock. The inverse of insert.
- **`fn_complete_sale` is an RPC** — do not replicate sale creation logic in JS. The function is atomic in Postgres.
- **Offline queue** — connectivity errors from any domain action should call `enqueueOfflineOperation`. Never let a connectivity error silently discard user work.

## What NOT to do (for AI agents)

- Do not split `StoreContext.tsx` into separate contexts without understanding cross-domain coupling (sales ↔ stock ↔ customers).
- Do not write inline `fmtCurrency` or `ConfirmDialog` — both have canonical locations.
- Do not query Supabase directly from components — always go through `useStore()` actions.
- Do not add `branch_id` to damaged goods inserts without running it through `asUuidOrNull()` — invalid UUIDs must be coerced to NULL.
- Do not assume `affects_accounting` column exists in `supplier_transactions` — the service layer handles the missing-column fallback.
