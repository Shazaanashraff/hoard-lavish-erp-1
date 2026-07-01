# How to document a unit (feature module)

This is the repeatable process for adding a feature module to the "second brain". The goal:
someone fixing a bug or answering a question reads **~2 files** (`docs/map/<unit>.md` +
`docs/fixes/<unit>.md`) instead of grepping 20 — and the docs stay fresh because code changes
update them in the same commit.

**Unit = feature module:** one UI surface + its backing `services/db/*` file(s) + the relevant
`supabase/migrations` (RPCs / triggers / RLS). **Primary optimization goal = Supabase egress /
cost** (the P1 / `EGRESS` tier).

---

## The rules that keep it fresh

1. **The code wins.** If an existing doc/README contradicts the code, fix the doc and flag it.
2. **Prove it or mark it.** Only write business rules the code proves. Anything whose *intent*
   you can't prove from code → mark `⚠️` and **ask the human** before locking. Never guess.
3. **Read the backend, don't just locate it.** The UI file shows *what* is called. The real
   transactional logic (atomicity, auth, writes) lives in RPCs/migrations/triggers/RLS and
   `services/db/*`. Open and read those bodies. If a called RPC/migration is **not in the repo**,
   say so and file a finding.
4. **Same-commit updates.** Changing a unit's code → update its `docs/map/<unit>.md` in the same
   change; log any new flaw in `docs/fixes/<unit>.md`.

---

## Steps 2–4 (per unit)

### Step 2 — Gather signals
- Size it: line counts of the UI file(s) and the `services/db` file(s).
- Grep for: imports, Supabase calls (`.from(`, `.rpc(`, `.select(`, `.insert(`, `.update(`,
  `.delete(`, `.channel(`/realtime), role/permission checks, external calls (Gemini, printer,
  PDF, CSV, electron API).
- Identify every backend object it touches: tables, RPCs, triggers, migrations.

### Step 2b — Read the backend layer (do NOT skip)
- Open the `services/db/*` function bodies and the migration SQL for every RPC/trigger used.
- Decide atomicity from the **SQL**, not the client: is the multi-step write wrapped in a
  function/transaction, or is it N separate client calls that can half-fail?
- Note egress shape: does a read project columns or `select('*')`? Does one insert trigger a
  full refetch? Is realtime scoped?

### Step 3 — Write `docs/map/<unit>.md`
- Copy `docs/map/_TEMPLATE.md`. Fill every fixed section with **only what code proves**.
- Trace one real user action end to end (click → StoreContext action → services/db → Supabase/RPC
  → state). Say what the **RPC actually does**, not "logic is in the RPC".
- Mark unprovable business rules with `⚠️`. Keep `Status: DRAFT` until the human answers them.

### Step 4 — Write `docs/fixes/<unit>.md`
- Copy `docs/fixes/_TEMPLATE.md`. File BUG / ATOMICITY / EGRESS / PERF / SECURITY / DEADCODE /
  TEST / CONSISTENCY findings, each with ID, severity, category, `file:line`, problem, impact, fix.
- Every finding must point at verified real code.

### Lock it
After the human answers the `⚠️` questions, fold the answers in, change `Status:` to `LOCKED`,
fill the "Last verified" date + commit. Then add the unit to the checklist below and to the index
lines in `docs/fixes/README.md`.

---

## Status — units done

| Unit | map | fixes | Status | Notes |
|------|-----|-------|--------|-------|
| POS / Checkout | ☑ | ☑ | **LOCKED** (reference) | gold standard — `docs/map/pos.md`, `docs/fixes/pos.md` |
| Inventory | ☑ | ☑ | **LOCKED** | `docs/map/inventory.md`, `docs/fixes/inventory.md` |
| Dashboard | ☑ | ☑ | **LOCKED** | `docs/map/dashboard.md`, `docs/fixes/dashboard.md` |
| Customers | ☐ | ☐ | | customer CRUD, loyalty |
| Suppliers | ☐ | ☐ | | supplier CRUD, transactions, damaged-goods tab, affects_accounting |
| Accounting | ☐ | ☐ | | expense entry + history |
| Settings | ☐ | ☐ | | settings, branch mgmt, CSV import |
| Sales History | ☐ | ☐ | | read-only sales ledger |
| Auth / Login | ☐ | ☐ | | PIN login, role gating |
| Offline / Sync | ☐ | ☐ | | offline queue, local* services, syncOfflineQueue |

Legend: ☐ todo · ◐ draft (awaiting answers) · ☑ locked.

---

## Scaling (Step 5)

Once the reference unit is approved: do **big units one per fresh session**, **batch small units**
in a session. Fresh sessions are cheaper than one growing session. Use the kickoff prompt below.

### Copy-paste kickoff prompt for a future session

```
Document the <UNIT> feature module for the second-brain docs in this repo
(S:\HoardLavish\hoard-lavish-erp-main). Follow docs/HOW-TO-DOCUMENT-A-UNIT.md exactly.

Unit = feature module (UI surface + its services/db files + relevant supabase/migrations).
Primary goal = Supabase egress/cost (P1 = EGRESS). The code wins over any stale doc.

Do Steps 2–4: gather signals, READ the backend RPC/migration/service bodies (don't just locate
them), write docs/map/<unit>.md from _TEMPLATE.md and docs/fixes/<unit>.md from its _TEMPLATE.md.
Mark any business rule whose intent you can't prove with ⚠️ and STOP AND ASK me before locking.
Use POS (docs/map/pos.md, docs/fixes/pos.md) as the shape to match. When done, update the
checklist + fixes/README index, and show me the draft before locking.
```
