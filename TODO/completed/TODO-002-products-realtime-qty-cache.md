# TODO-002: Products — realtime qty deltas + daily catalog cache (drop from fetch-all/poll)

- **ID:** 002
- **Priority:** P1
- **Status:** DONE

## Description

`fetchProductsWithStock` (products table + `product_branch_stock` join) is one of
the largest recurring payloads, and it is re-pulled in full on every 30s poll and
every realtime event. Replace that with a cache + qty-delta model:

- **Catalog** (name, sku, price, cost, category, etc.) changes rarely → fetch
  **once per day** and persist in a local cache.
- **Quantities** (`product_branch_stock`) churn constantly → on each app
  mount, reconcile via the **lightweight** `fetchBranchStock()` (returns only
  `{ productId, branchId, quantity }`), and during the session keep them live via
  **realtime deltas** on the `product_branch_stock` table — each event carries
  only the single changed `{ product_id, branch_id, quantity }` row, which is
  patched directly into the local cache (no refetch).
- **Remove `fetchProductsWithStock` from the full refetch/poll path** so products
  no longer ride the recurring full-DB dumps.

Completed in branch `TODO/products-realtime-qty-cache`.
