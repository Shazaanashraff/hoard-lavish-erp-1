# TODO-010: Expenses — scoped period fetch (Accounting + Dashboard), drop `fetchExpenses` from the fetch-all

- **ID:** 010
- **Priority:** P1
- **Status:** TODO

## Description

`db.fetchExpenses()` is pulled **in full** on every `loadAll` and every
`refreshFromSupabase` (30s poll / realtime), and the `expenses` table is
**unbounded** — it grows with every recorded expense. Migrate its **two** consumers
onto **scoped period fetches**, then remove `fetchExpenses` from both fetch-all
paths and stop the `expenses` realtime event from triggering a full-DB refetch.

The `Expense` row is **flat** (no joins) and carries `branchId`, `category`,
`amount`, `date`. Both consumers are **period + branch scoped** — the same shape as
sales:

| Page | Site | Scope it needs | Used for |
| --- | --- | --- | --- |
| **Accounting** | [Accounting.tsx:47](../../components/Accounting.tsx#L47) | expenses in the **selected period** | operating-expense total, `expenseBreakdown`, cashflow + ledger rows |
| **Dashboard** | [Dashboard/index.tsx:135](../../components/Dashboard/index.tsx#L135) | **current branch + selected period** (`daily`/`monthly`) | metrics expense figure + Day-End Report |

Both request essentially the **same `(period, branch)` scope** → they should
**share one cache entry**, exactly like sales Group A in
[TODO-005](TODO-005-sales-migrate-remaining-consumers-drop-fetchall.md). Fold the
expenses fetch into the **TODO-004 / TODO-005 period loaders** those pages already
use rather than adding a parallel cache.

Background: [docs/EGRESS_OPTIMIZATION.md](../../docs/EGRESS_OPTIMIZATION.md).
Service: [services/db/expenses.ts:16-20](../../services/db/expenses.ts#L16-L20) (currently takes **no args** — fetches the whole table).

> **Not local storage** (the table grows unboundedly). No payload trimming needed —
> the row is already small; the lever is the **period + branch server-side filter**
> so only the period's handful of rows come back instead of the whole table.

## The fetch-all wiring to remove (after both consumers are migrated)

- `loadAll` — `db.fetchExpenses()` [StoreContext.tsx:494](../../context/StoreContext.tsx#L494) → `setExpenses(...)` [:537](../../context/StoreContext.tsx#L537).
- `refreshFromSupabase` — `db.fetchExpenses()` [:586](../../context/StoreContext.tsx#L586) → `setExpenses(...)` [:604](../../context/StoreContext.tsx#L604).
- Realtime `expenses` [:661](../../context/StoreContext.tsx#L661) must **no longer** trigger the full `refreshFromSupabase`.
- **Optimistic writers stay** (same-machine fresh path): `addExpense` [:1804-1811](../../context/StoreContext.tsx#L1804-L1811), `deleteExpense` [:1818](../../context/StoreContext.tsx#L1818) — each `setExpenses(prev => ...)`. Cross-device → **Refresh**.

## Steps

1. **Service** (`services/db/expenses.ts`): add `branchId` / `dateFrom` / `dateTo`
   options to `fetchExpenses` (`.eq('branch_id', …)`, `.gte('date', …)`,
   `.lte('date', …)`). Keep the no-arg behavior working for any remaining caller.
2. **Accounting** ([components/Accounting.tsx](../../components/Accounting.tsx)):
   fetch `{ dateFrom, dateTo }` (+ branch if the page is branch-scoped) on
   period-select; derive `filteredExpenses` / totals / breakdown / ledger from the
   result. Drop `expenses` from the `useStore()` destructure [:11](../../components/Accounting.tsx#L11).
3. **Dashboard** ([components/Dashboard/index.tsx](../../components/Dashboard/index.tsx)
   + TODO-004 loaders): fetch `{ branchId: currentBranch.id, dateFrom, dateTo }` on
   Fetch / Generate Report; reuse the **same** cache entry as Accounting for the same
   scope. Drop `expenses` from the `useStore()` destructure [:19](../../components/Dashboard/index.tsx#L19).
4. **Drop from fetch-all** — remove `db.fetchExpenses()` from `loadAll` +
   `refreshFromSupabase`; `expenses` realtime stops the full refetch; keep the
   optimistic writers.
5. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `services/db/expenses.ts` — add `branchId` / `dateFrom` / `dateTo` to `fetchExpenses`
- `components/Accounting.tsx` — period-scoped expense fetch, drop global slice
- `components/Dashboard/index.tsx` (+ TODO-004 loaders) — shared period fetch for metrics + Day-End Report, drop global slice
- `context/StoreContext.tsx` — remove `fetchExpenses` from `loadAll` + `refreshFromSupabase`, stop `expenses` realtime full-refetch, keep optimistic writers
- `tests/` — new completion test (colocated, mirrors `utils/revenue.test.ts`)

## Acceptance criteria

- [ ] **Completion verification test** (this task only — `npx vitest run <this-test-file>`,
      not the whole suite; `NODE_ENV=test`; mock `db`/realtime). It must prove the
      scoped fetches reproduce each page's output with **no difference before/after**:
      - **No global load:** after `loadAll`, after `refreshFromSupabase`, and after an
        `expenses` realtime event, `fetchExpenses` is **not** called for a
        full/unbounded pull and `expenses` is **not** bulk-populated.
      - **Accounting parity:** for a selected period, the scoped `{ dateFrom, dateTo }`
        fetch yields the **same** operating-expense total, `expenseBreakdown` buckets,
        and ledger rows the old `expenses.filter(...)` produced from the global slice.
      - **Dashboard parity:** the metrics expense figure and the Day-End Report
        expense section/total match the old global-slice output for the same
        `(branch, period)`.
      - **Shared cache:** Accounting and Dashboard requesting the same `(period, branch)`
        scope produce **0** extra fetches on the second consumer (one shared entry).
      - **Fresh write (same machine):** `addExpense` / `deleteExpense` optimistically
        update the relevant page without a refetch; **Refresh** pulls latest.
      - **No-regression:** given the same expense data, both pages render exactly what
        they did off the global slice — the migration changes **what is fetched**,
        never **what the user sees**.
- [ ] Neither Accounting nor Dashboard destructures `expenses` from the global
      fetch-all path; both fetch their period scope on demand.
- [ ] App runs; Accounting totals/breakdown/ledger and the Dashboard metrics +
      Day-End Report are correct for the selected period, and nothing downloads the
      full `expenses` table on mount or poll.
