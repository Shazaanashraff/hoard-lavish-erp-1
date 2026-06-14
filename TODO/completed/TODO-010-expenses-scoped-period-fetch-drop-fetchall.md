# TODO-010: Expenses — scoped period fetch (Accounting + Dashboard), drop `fetchExpenses` from the fetch-all

- **ID:** 010
- **Priority:** P1
- **Status:** completed

## Description

`db.fetchExpenses()` is pulled **in full** on every `loadAll` and every
`refreshFromSupabase` (30s poll / realtime), and the `expenses` table is
**unbounded** — it grows with every recorded expense. Migrate its **two** consumers
onto **scoped period fetches**, then remove `fetchExpenses` from both fetch-all
paths and stop the `expenses` realtime event from triggering a full-DB refetch.

Implemented on branch: TODO/expenses-scoped-period-fetch-drop-fetchall
