# Inventory

> One-line: manage the product catalog (CRUD + variation builder), per-branch stock adjustments,
> inter-branch transfers, damaged-goods write-offs, and barcode-label printing.
>
> Status: **LOCKED** · Last verified against code: 2026-06-30 · Commit: 6091b5f

Read this file (and `docs/fixes/inventory.md`) before editing Inventory. If the code and this doc
disagree, **the code wins** — fix the doc in the same change. Shares the per-branch stock model with
the [POS unit](./pos.md); the systemic stock-write race (fixes INV-04) spans both.

---

## Key files

| File | Role |
|------|------|
| [components/Inventory/index.tsx](../../components/Inventory/index.tsx) (2006 lines) | UI entry point — product table, add/edit form, **variation builder**, stock-adjust modal, transfer modal, damaged-goods tab, barcode printing (JsBarcode). |
| [context/StoreContext.tsx](../../context/StoreContext.tsx) | Actions: `addProduct`, `updateProduct`, `deleteProduct`, `adjustStock`, `transferStock`, `addDamagedGood`, `deleteDamagedGood`. |
| [services/db/products.ts](../../services/db/products.ts) | `fetchProductsWithStock`, `insertProduct`, `updateProduct`, `deleteProduct` (+ 3 delete modes), linked-sales lookup. |
| [services/db/inventory.ts](../../services/db/inventory.ts) | Damaged goods CRUD — **also mutates stock + logs movements internally** (see Gotchas), `initializeBranchStock`. |
| [services/db/transfers.ts](../../services/db/transfers.ts) | `insertStockTransfer`, `fetchStockTransfers` — **runtime-feature-flagged** (table may not exist → silent no-op). |
| [services/db/stockMovements.ts](../../services/db/stockMovements.ts) | `upsertBranchStock` (absolute set), `insertStockMovement`. |
| [supabase/migrations/001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql) | `products`, `product_branch_stock` (PK `product_id,branch_id`), `v_products_with_stock` view. |
| [supabase/migrations/002_inventory_and_damaged_goods.sql](../../supabase/migrations/002_inventory_and_damaged_goods.sql) | `color`/`size` columns, `damaged_goods` table (**no unique constraint**). |
| [supabase/migrations/003_stock_transfers.sql](../../supabase/migrations/003_stock_transfers.sql) | `stock_transfers` (items as JSONB). |
| [supabase/migrations/004_add_barcode_fields.sql](../../supabase/migrations/004_add_barcode_fields.sql), [014](../../supabase/migrations/014_add_branch_tracking_to_damaged_goods.sql) | barcode fields; damaged-goods `branch_id`. |
| [supabase/migrations/016_categories_brands_local_first.sql](../../supabase/migrations/016_categories_brands_local_first.sql) | `updated_at`/`deleted_at` on `categories`/`brands`; `fn_rename_category`/`fn_rename_brand` RPCs (atomic rename + cascade to `products`/`expenses`). |
| [services/localCategories.ts](../../services/localCategories.ts), [services/localBrands.ts](../../services/localBrands.ts), [services/localTagStore.ts](../../services/localTagStore.ts) | Local-first cache + last-write-wins merge for categories/brands. |
| [electron/localStore.cjs](../../electron/localStore.cjs), [services/localStoreClient.ts](../../services/localStoreClient.ts) | Main-process `electron-store` + renderer IPC bridge (`local-store:get`/`local-store:set`) backing the categories/brands cache. |

**There are NO RPCs/triggers for inventory** except `fn_rename_category`/`fn_rename_brand` (categories/
brands). Every stock mutation is client-orchestrated via `upsertBranchStock` (absolute set from a
prior read). Contrast `fn_complete_sale`, which is atomic.

## Categories & brands (local-first)

Unlike everything else in this file, categories/brands are **read only from a local cache**
(`context/StoreContext.tsx`'s `categoryRecords`/`brandRecords` state, hydrated from
`loadLocalCategories()`/`loadLocalBrands()` on mount) — the UI's `categories`/`brands` string
arrays are a derived, active-only, name-only view (`useMemo` over the records) kept for backward
compatibility with every existing consumer. Supabase is a write-target and background
reconciliation source only: `refreshFromSupabase` (30s fallback poll / realtime / reconnect) fetches
remote rows and **merges** them into the cache via last-write-wins by `updated_at`
(`mergeCategoriesLWW`/`mergeBrandsLWW`), never overwrites local state directly.

- **Add/remove/rename** (`addCategory`/`removeCategory`/`updateCategory`, `context/StoreContext.tsx`)
  write the local cache first, then queue the Supabase write through the existing offline-queue
  (`ADD_CATEGORY`/`REMOVE_CATEGORY`/`UPDATE_CATEGORY`, mirrored for brands).
- **Delete is a soft-delete** (`deleted_at` tombstone, both locally and in Supabase) so a
  delete-vs-rename/add race across two devices can be resolved by comparing timestamps instead of a
  row just vanishing. Tombstones are pruned locally after 90 days.
- **Rename cascades**: `updateCategory`/`updateBrand` update the local products/expenses cache
  immediately, and call `fn_rename_category`/`fn_rename_brand` (atomic, cascades to
  `products.category`/`expenses.category` or `products.brand` server-side).
- **Storage**: `electron-store`, but it runs in the Electron **main process** only
  (`electron/localStore.cjs`) — the renderer talks to it over IPC
  (`services/localStoreClient.ts` → `window.electronAPI.localStore`) because
  `contextIsolation: true` / `nodeIntegration: false` means `require('electron-store')` never works
  inside the renderer bundle. Tests and non-Electron contexts fall back to an in-memory object.
- Tests: [tests/todo-010-categories-brands-local-first.test.ts](../../tests/todo-010-categories-brands-local-first.test.ts).

## How it works

- **Add product:** the form supports a single product or the **variation builder** — each chosen
  color/size row becomes a **separate product** (`addProduct` is called once per variation,
  `Inventory/index.tsx:205-227`; names are `"<base> — <color> / <size>"`). `addProduct` →
  `db.insertProduct` (`products.ts:46`): insert the `products` row, then insert a
  `product_branch_stock` row per branch; if the stock insert fails it **deletes the product** as a
  manual rollback (not a transaction).
- **Edit product:** `updateProduct` → `db.updateProduct` updates changed columns, then **loops**
  upserting `product_branch_stock` per branch. Also logs a 0-qty `ADJUSTMENT` "Product edited"
  movement for the activity feed.
- **Delete product:** three modes (`products.ts:113`): `BLOCK_IF_LINKED` (default — throws if the
  product is referenced by `sale_items`), `KEEP_SALES_SNAPSHOT` (sets `sale_items.product_id = NULL`,
  needs migration 007), `DELETE_LINKED_SALES` (**deletes the linked `sales` rows**, fixes INV-02).
  After a successful delete it calls `refreshFromSupabase()` (full catalog refetch).
- **Adjust stock:** `adjustStock(productId, qty, IN|OUT|ADJUSTMENT, reason)` updates the current
  branch only; `IN` adds, `OUT` subtracts, `ADJUSTMENT` **sets the absolute** value; result floored
  at 0. Persists via `upsertBranchStock(absolute)` + `insertStockMovement`.
- **Transfer stock:** `transferStock(toBranchId, items, notes)` deducts from `currentBranch`, adds to
  the destination, logs `TRANSFER`/movement rows on both sides, and inserts a `stock_transfers` row.
  Multi-step, no transaction (UI rolls back only on permission errors). Feature is silently disabled
  if the `stock_transfers` table is absent.
- **Damaged goods:** `addDamagedGood` reduces current-branch stock and records the write-off;
  `deleteDamagedGood` restores it. **Both the service AND the caller mutate stock** — see Gotchas /
  fixes INV-01.
- **Barcode printing:** `JsBarcode` renders a Code128 SVG (`Inventory/index.tsx:500-514`) →
  `printBarcodeLabels` → `window.electronAPI.printReceipt`. Variation rows can batch-print labels.

## Business rules

- **Who can do what:** **CASHIER is restricted in the UI** — `isCashier` (`Inventory/index.tsx:37`)
  hides the Add-Product button, the Transfers and Categories tabs, and per-row edit/delete actions.
  ADMIN/MANAGER see everything. **This gate is UI-only** — the StoreContext actions and RLS
  (`"Allow all"`) do not enforce it (fixes INV-06). This is the only feature with role gating; POS has none.
- **Stock floor:** branch stock is floored at 0 everywhere (`Math.max(0, …)`); it never goes negative.
- **Variation = product:** there is no parent/variant entity — each color/size combination is a
  standalone `products` row with its own SKU/barcode/stock.
- **Product↔sales linkage:** a product referenced by `sale_items` cannot be plain-deleted; the user
  must explicitly choose to unlink (keep sales snapshot) or delete the linked sales.
- **Transfers are optional:** governed by runtime table-detection; if the table is missing, transfer
  reads return `[]` and writes no-op silently.

## Actions & Tools

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|
| `addProduct` | Insert product (+ per variation) | `insertProduct` → `products`, `product_branch_stock` |
| `updateProduct` | Update fields + per-branch stock | `updateProduct` (loop upsert) |
| `deleteProduct` | Delete w/ link-handling mode | `deleteProduct` → `products` (+ `sale_items`/`sales` per mode), then full refetch |
| `adjustStock` | IN/OUT/ABS adjust, current branch | `upsertBranchStock` (absolute) + `insertStockMovement` |
| `transferStock` | Move stock between branches | `upsertBranchStock`×2/item + movements + `insertStockTransfer` |
| `addDamagedGood` / `deleteDamagedGood` | Write off / restore | `insertDamagedGood`/`deleteDamagedGood` (**which also touch stock**) + redundant upsert/movement |
| Barcode print | Code128 label(s) | `JsBarcode`, `electronAPI.printReceipt` |
| `fetchProductsWithStock` | Load whole catalog + all stock | `products` + `product_branch_stock` (full) |

## Gotchas (surprising-but-intentional)

- **`db.insertDamagedGood` is NOT a plain insert** — it also reads stock, decrements it, and logs an
  `OUT` movement (`inventory.ts:52-74`). The caller `addDamagedGood` does the *same thing again*,
  causing a double write (fixes INV-01). `architecture.md` describes the service behavior correctly
  but doesn't mention the caller duplicates it.
- **`ADJUSTMENT` sets the absolute quantity**, not a delta — `adjustStock` with type `ADJUSTMENT`
  treats `quantity` as the new stock level. IN/OUT are deltas.
- **All stock writes are absolute, from a stale client read** — `upsertBranchStock(value)` overwrites,
  so concurrent edits race (fixes INV-04). Sales avoid this via the atomic RPC; inventory does not.
- **Transfers can silently no-op** if the `stock_transfers` table isn't deployed — by design, but it
  means a "successful" UI transfer may not have persisted the transfer record (stock still moved).
- **Each variation is a brand-new product row** — editing the base name later does not rename variants.

## Tests

| Path | Covered? | Test file |
|------|----------|-----------|
| Local product cache / lazy load | ✅ | `tests/localProducts.test.ts`, `tests/customers.lazy.test.ts` |
| Stock-movements lazy scoping | ✅ | `tests/todo-007-stock-movements-lazy-scoped.test.ts` |
| `adjustStock` / `transferStock` math | ❌ | — (fixes INV-08) |
| Damaged-goods add/delete stock effect | ❌ | — (fixes INV-08) |
| Variation product creation | ❌ | — (fixes INV-08) |
| `deleteProduct` modes (unlink / delete-sales) | ❌ | — (fixes INV-08) |

---

<!-- changelog: append one line per code change that touched this unit -->
- 2026-06-30 6091b5f — initial documentation.
