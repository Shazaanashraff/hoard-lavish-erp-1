# TODO-006: Sales — server-side daily-totals aggregate RPC + thin `fetchSalesDailyTotals` wrapper

- **ID:** 006
- **Priority:** P1
- **Status:** TODO

## Description

Split out of [TODO-005](TODO-005-sales-migrate-remaining-consumers-drop-fetchall.md):
this is the **DB + service-layer foundation** that 005's Group-A (aggregate sums)
caching sits on. It does **two narrow, purely additive things**:

1. **DB migration** — a Postgres RPC `fn_sales_daily_totals(p_branch_id, p_date_from, p_date_to)`
   that returns one row per `(date, branch_id)` with server-computed
   `sum(total_amount)`, `sum(total_cost)`, `count(*)`. Totals are computed in the
   DB so only a handful of rows come back — **egress is O(days), not O(sales)**.
2. **Service wrapper** — a thin `fetchSalesDailyTotals(...)` in
   [services/db/sales.ts](../../services/db/sales.ts) that calls the RPC and maps
   the rows to a typed shape.

This task is deliberately isolated because Step 1 is a **Supabase migration** — a
different kind of change from the TS/React wiring in 005, and one that 005's
"verify only this task, mock db" gate can't exercise as a real RPC. Keeping it
here lets each task stay verifiable in isolation. **TODO-005 depends on this.**

> **Additive only — nothing existing changes.** `fetchSales` and every other
> export in `sales.ts` are left exactly as-is. No consumer is migrated here (that
> is 004/005). After this task the codebase has a *new, unused-by-default* RPC and
> wrapper available for 005 to build on — so it is impossible for this task to
> break any path that fetched sales before it.

Background: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Current `fetchSales`: [services/db/sales.ts:114-127](../../services/db/sales.ts#L114-L127).

## The RPC

`fn_sales_daily_totals(p_branch_id UUID DEFAULT NULL, p_date_from DATE, p_date_to DATE)`
returning a table of:

| column | type | meaning |
| --- | --- | --- |
| `date` | DATE | the sale day (`date_trunc('day', sales.date)::date`) |
| `branch_id` | UUID | branch the totals belong to |
| `sum_amount` | NUMERIC | `sum(total_amount)` for that day × branch |
| `sum_cost` | NUMERIC | `sum(total_cost)` for that day × branch |
| `tx_count` | INTEGER | `count(*)` of sales for that day × branch |

Semantics that must match the **old client-side summation** of `fetchSales` rows
exactly (so 005's pages produce identical numbers):

- `p_branch_id NULL` → **all branches**, grouped by branch (used by Branches page
  per-branch cards and the all-branches chart). Non-null → that branch only.
- `p_date_from` / `p_date_to` are **inclusive** on the `date` column, matching
  `fetchSales`'s `.gte('date', from)` / `.lte('date', to)`.
- Empty range → **zero rows** (callers treat "no rows" as 0, never as an error).
- Money columns are `NUMERIC` (no float drift); the wrapper `Number(...)`s them
  the same way `mapSale` does for `total_amount` / `total_cost`.
- Follow the existing migration conventions (see
  [009_void_sale.sql](../../supabase/migrations/009_void_sale.sql)):
  `CREATE OR REPLACE FUNCTION`, `LANGUAGE sql`/`plpgsql`, and end with
  `NOTIFY pgrst, 'reload schema';` so PostgREST picks up the new RPC.

## The wrapper

In `services/db/sales.ts`, **append** (do not modify existing fns):

```ts
export interface SalesDailyTotal {
    date: string;        // YYYY-MM-DD
    branchId: string;
    sumAmount: number;
    sumCost: number;
    txCount: number;
}

export interface FetchSalesDailyTotalsOptions {
    branchId?: string;   // omitted/undefined → all branches grouped by branch
    dateFrom: string;
    dateTo: string;
}

export async function fetchSalesDailyTotals(
    options: FetchSalesDailyTotalsOptions
): Promise<SalesDailyTotal[]> { /* supabase.rpc('fn_sales_daily_totals', {...}); map rows */ }
```

The mapper turns RPC snake_case rows into the camelCase `SalesDailyTotal` shape
and `Number(...)`s the numeric columns. On RPC `error`, `throw error` (same
posture as `fetchSales`).

## Steps

1. **DB migration** — add `supabase/migrations/015_sales_daily_totals.sql` defining
   `fn_sales_daily_totals` per the table/semantics above; end with the PostgREST
   `NOTIFY pgrst, 'reload schema';` line.
2. **Service wrapper** — append `SalesDailyTotal`, `FetchSalesDailyTotalsOptions`,
   and `fetchSalesDailyTotals` to `services/db/sales.ts`. **Touch nothing else** in
   that file.
3. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `supabase/migrations/015_sales_daily_totals.sql` — **new** aggregate RPC
- `services/db/sales.ts` — **append** `fetchSalesDailyTotals` + its types (existing
  exports untouched)
- `services/db/sales.dailyTotals.test.ts` — **new** completion test (colocated,
  mirrors `utils/revenue.test.ts`)

## Acceptance criteria

- [ ] **Completion verification test** (this task only —
      `npx vitest run services/db/sales.dailyTotals.test.ts`, not the whole suite;
      mock the `supabase` client). It must prove:

      **1 — Wrapper parity (the aggregate equals the old client-side sum).** Given a
      fixed set of sale rows, assert `fetchSalesDailyTotals` returns, per
      `(date, branch_id)`, exactly `sum(total_amount)`, `sum(total_cost)`, and
      `count(*)` — i.e. the **same numbers** a caller would have gotten by calling
      `fetchSales(...)` and reducing the rows client-side (the pre-change path).
      Build the expected values by actually summing the mock rows so the test is a
      true parity check, not a hard-coded echo.

      **2 — Args & shape.** `fetchSalesDailyTotals` calls
      `supabase.rpc('fn_sales_daily_totals', { p_branch_id, p_date_from, p_date_to })`
      with the right params; `branchId` omitted → `p_branch_id: null`. Returned
      objects have the camelCase `SalesDailyTotal` shape with numeric (not string)
      money fields. Empty RPC result → `[]` (not a throw); RPC `error` → throws.

      **3 — Regression guard (the old system still works unchanged).** In the same
      file, assert the **pre-existing** `fetchSales` is **untouched and still works**:
      it still issues the `*, sale_items(*, products(...))` select with the same
      `branch_id` / `date` / `payment_method` / `limit` filters and maps rows via
      `mapSale` exactly as before. This is the explicit *"wherever the fetches worked
      before, they still work after"* check — adding the RPC must change **zero**
      existing behavior.

- [ ] App still builds/imports `services/db/sales.ts` with no change to any existing
      caller of `fetchSales` (the new export is additive).
- [ ] Migration `015_sales_daily_totals.sql` is present and ends with the PostgREST
      schema-reload notify, consistent with the other migrations.
