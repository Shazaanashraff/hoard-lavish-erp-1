# Task Queue

This is the work queue for the autonomous task agent. See [CLAUDE.md](CLAUDE.md)
for how the agent selects and processes tasks.

- **Priority:** `P1` (highest) → `P2` → `P3` (lowest).
- **Status:** `[ ]` incomplete, `[x]` done.
- Each row maps to a file in [active/](active/) named `TODO-<ID>-<slug>.md`.
  When a task is finished, its file moves to [completed/](completed/).

## Tasks

| ID  | Priority | Status | Task |
| --- | -------- | ------ | ---- |
| 001 | P1 | [x] | Move branches to local storage and drop them from the fetch-all |
| 002 | P1 | [x] | Products — realtime qty deltas + daily catalog cache (drop from fetch-all/poll) |
| 003 | P2 | [ ] | Customers — lazy load + daily cache (drop from fetch-all) |
| 004 | P1 | [ ] | Dashboard — central on-demand sales loaders (no mount fetch, scoped + cached) |
| 005 | P1 | [ ] | Sales — migrate POS/Accounting/Customers/SalesHistory/Branches to scoped fetches, drop fetchSales from fetch-all (after 004 + 006) |
| 006 | P1 | [ ] | Sales — daily-totals aggregate RPC + fetchSalesDailyTotals wrapper (DB migration; 005 depends on it) |
| 007 | P1 | [ ] | Stock movements — lazy/scoped fetch for Inventory history + Dashboard activity feed, drop fetchStockMovements from fetch-all (after 004) |
| 008 | P1 | [ ] | Suppliers — lazy fetch on page open + local-first cache, drop fetchSuppliers from fetch-all |
| 009 | P1 | [ ] | Supplier transactions — remove from Accounting + Day-End report, Suppliers becomes sole consumer (lazy fetch + paginated), drop fetchSupplierTransactions from fetch-all |
| 010 | P1 | [ ] | Expenses — scoped period fetch (Accounting + Dashboard), drop fetchExpenses from fetch-all |
| 011 | P1 | [ ] | Users — local-first cache (electron-store, seeded with INITIAL_USERS), drop fetchUsers from fetch-all |
| 012 | P1 | [ ] | Settings — wire existing localSettings.ts into mount + updateSettings, drop fetchSettings from fetch-all |
