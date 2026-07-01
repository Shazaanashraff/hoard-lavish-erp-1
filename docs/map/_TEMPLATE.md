# <Unit name>

> One-line: what this feature does for the user, in plain language.
>
> Status: DRAFT | LOCKED · Last verified against code: <YYYY-MM-DD> · Commit: <short-sha>

Read this file (and `docs/fixes/<unit>.md`) before editing this feature. If the code and this
doc disagree, **the code wins** — fix the doc in the same change and note it in the changelog line.

---

## Key files
<!-- The ~2 files someone should open to work here, plus the backend that actually does the work.
     Use clickable relative links. Mark which file is the entry point vs the backend. -->

| File | Role |
|------|------|
| `components/<...>` | UI entry point — what gets called |
| `services/db/<...>.ts` | DB layer — the real reads/writes/mapping |
| `supabase/migrations/<...>.sql` | RPC / trigger / RLS that wraps the writes (atomic?) |

## How it works
<!-- The actual flow, top to bottom, as the code proves it. Name the functions. Trace a real
     user action from click → action in StoreContext → services/db → Supabase/RPC → state update.
     Distinguish "client does X" from "the RPC does X". -->

## Business rules
<!-- Who-can-do-what, limits, status lifecycle. ONLY rules the code proves.
     Mark any rule whose INTENT you cannot prove from code with ⚠️ and ask before locking. -->

- **Who can do what:** <role/permission checks found in code, or "none found">
- **Limits / validation:** <quantities, stock checks, required fields>
- **Status lifecycle:** <e.g. draft → completed → voided; where each transition happens>

## Actions & Tools
<!-- The named StoreContext actions / service functions this unit calls, and external calls
     (Supabase tables, RPCs, Gemini, printer, PDF, CSV). One line each. -->

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|

## Gotchas
<!-- Surprising-but-INTENTIONAL behaviour. The things that look like bugs but aren't, and the
     traps a junior would fall into. Not findings — findings go in docs/fixes/. -->

## Tests
<!-- What's covered, what isn't. Point to the test files. Note untested critical paths
     (those become TEST findings in docs/fixes/<unit>.md). -->

| Path | Covered? | Test file |
|------|----------|-----------|

---

<!-- changelog: append one line per code change that touched this unit -->
- <YYYY-MM-DD> <short-sha> — initial documentation.
