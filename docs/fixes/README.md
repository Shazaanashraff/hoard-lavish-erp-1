# Findings system — Hoard Lavish ERP

A findings file (`docs/fixes/<unit>.md`) records what is *wrong or risky* in a feature module.
Its sibling `docs/map/<unit>.md` records how that module *works*. Read the map first; this is the
defect log.

The primary optimization goal for this codebase is **Supabase egress / cost** — that is why
`EGRESS` is the P1 tier and its own category. (Existing references: `docs/EGRESS_OPTIMIZATION.md`,
`docs/optimisation/CENTRAL_FETCHING.md`, `docs/optimisation/CRUD_OPTIMISATION_PLAYBOOK.md`.)

## Severity

| Sev | Meaning | Examples |
|-----|---------|----------|
| **P0** | Broken / data-integrity | Wrong stock after sale, lost write, double-charge, corrupt total |
| **P1** | **Egress / cost** (primary goal) | Full-table fetch on mount, refetch-everything after one insert, unbounded realtime, no column projection |
| **P2** | Performance or security | N+1 render, missing `await`, no auth check on a privileged action, secret in client |
| **P3** | Cleanup / tests | Dead code, missing test on a critical path, inconsistent naming |

When a finding fits two tiers, file it at the **higher** tier (P0 over P1).

## Categories

| Category | Use when |
|----------|----------|
| `BUG` | Logic is simply wrong |
| `ATOMICITY` | A multi-step write has no transaction — partial failure leaves inconsistent data |
| `EGRESS` | Reads/writes more Supabase data than needed (the primary-goal category) |
| `PERF` | Slow at runtime but not a cost issue (render, latency, blocking) |
| `SECURITY` | Auth/permission gap, injection, secret exposure, RLS hole |
| `DEADCODE` | Unused export, unreachable branch, orphaned file |
| `TEST` | Missing/insufficient coverage on something that can break silently |
| `CONSISTENCY` | Same concept implemented two different ways; drift between modules |

## Finding block format

```
### <UNIT>-NN · <severity> · <category> · `path/to/file.ts:line`
- **Problem:** what the code does, specifically (name the function/line)
- **Impact:** what it costs the user / the data / the bill, and when it triggers
- **Fix:** the concrete change to make
```

- **ID** = `<UNIT>-NN` (e.g. `POS-03`). Numbers are monotonic per unit and never reused.
- **Where** is a clickable `file:line`. Findings must point at real code, verified — not hunches.
- Base ATOMICITY / SECURITY / EGRESS findings on the **backend** body (RPC/migration/service),
  not on how the client call *looks*. A risky-looking client call may be safe inside an RPC
  transaction, and a clean-looking one may hide a non-atomic multi-write.

## Index of finding files

<!-- one line per documented unit; add as units get documented -->
- [pos.md](./pos.md) — POS / Checkout · 2 P0 (exchange atomicity, sale-edit unique-violation) + oversell & soft-void P0s, egress + RLS P2s.
- [inventory.md](./inventory.md) — Inventory · P0 delete-linked-sales data loss · P1 full-catalog egress · stock-write race, damaged-goods double-write, UI-only role gate (P2s).
- [dashboard.md](./dashboard.md) — Dashboard · P0 edit re-runs INSERT-only RPC (=POS-02) · P1 chart/top-performers fetch all rows, ignore `fn_sales_daily_totals` · UI-only admin gate + stale recent-sales cache (P2s).
