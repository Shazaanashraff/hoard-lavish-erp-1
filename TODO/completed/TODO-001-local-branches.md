# TODO-001: Move branches to local storage and drop them from the fetch-all

- **ID:** 001
- **Priority:** P1
- **Status:** COMPLETED

## Description

There are only **2 branches** and they almost never change. Fetching them from
Supabase on every app load (and subscribing to the `branches` table for realtime
updates) is wasted egress. Move branches to **local persistence via
electron-store** (the same mechanism already used for app settings in
[`services/localSettings.ts`](../../services/localSettings.ts)), seed it with the
real branch data below, and **remove `fetchBranches` from the mount fetch-all**
in [`context/StoreContext.tsx`](../../context/StoreContext.tsx).

electron-store writes to Electron's `userData` directory, which is **not wiped on
app update**, so this is persistent across new releases. Branch printer names
(`thermalPrinterName` / `barcodePrinterName`) are effectively per-machine
settings, so local storage is also more correct than global sync.

Background and the broader egress effort:
[`docs/EGRESS_OPTIMIZATION.md`](../../docs/EGRESS_OPTIMIZATION.md).

### Canonical branch data (seed defaults)

Map snake_case → the `Branch` type in [`types.ts`](../../types.ts)
(`thermal_printer_name → thermalPrinterName`,
`barcode_printer_name → barcodePrinterName`; drop `created_at`):

```json
[
  {
    "id": "b0000000-0000-0000-0000-000000000001",
    "name": "Ethul Kotte",
    "address": "veediya bandara mw , ethul kotte ",
    "phone": "0741774321",
    "thermalPrinterName": "POSPrinter POS80",
    "barcodePrinterName": "Xprinter XP-T451B"
  },
  {
    "id": "b0000000-0000-0000-0000-000000000002",
    "name": "Mount Lavinia",
    "address": "273 GALLE RD MOUNT LAVINIA",
    "phone": "0741774321",
    "thermalPrinterName": "POS-80 (copy 1)",
    "barcodePrinterName": "Xprinter XP-T451B"
  }
]
```

> These UUIDs are referenced by existing sales/stock rows as `branchId` — they
> must be used **exactly**. Do not invent new IDs.

## Steps

1. **Create `services/localBranches.ts`** mirroring the structure of
   `services/localSettings.ts`:
   - Use `electron-store` with a `try/require` guard and an in-memory fallback
     when `process.env.NODE_ENV === 'test'` or electron-store is unavailable
     (copy the pattern exactly so tests don't touch disk).
   - Store name: `app_branches`, key: `branches`, `defaults: { branches: DEFAULT_BRANCHES }`.
   - Export: `loadLocalBranches(): Branch[]`, `saveLocalBranches(b: Branch[]): void`,
     and `upsertLocalBranch(branch: Branch): Branch[]`.
   - Define `DEFAULT_BRANCHES` from the canonical data above (or import a shared
     constant — see step 2).
2. **Update `constants.ts`**: replace the stale `INITIAL_BRANCHES`
   (`b1`/`b2`) with the canonical 2 branches above, so any code still importing
   it gets correct IDs. `localBranches.ts` can reuse `INITIAL_BRANCHES` as its
   defaults.
3. **Wire `StoreContext` to local branches:**
   - On init, seed `branches` and `currentBranch` from `loadLocalBranches()`
     instead of from Supabase.
   - In `loadAll()`, **remove** `db.fetchBranches()` from the `Promise.all`,
     remove `setBranches(branchesData)`, and base `currentBranch` on the local
     branches (keep the "first branch" default and the `login()` branch lookup
     working).
   - In `addBranch()` and `updateBranch()`, persist via `saveLocalBranches` /
     `upsertLocalBranch` instead of `db.insertBranch` / `db.updateBranch`. Keep
     the optimistic state updates.
   - **Remove the `branches` realtime subscription** line in the realtime
     effect (the `.on('postgres_changes', { ... table: 'branches' }, onEvent)`
     entry) so branch changes no longer trigger a full refetch.
4. **Do not** remove `db.fetchBranches` / `insertBranch` / `updateBranch` from
   the service layer yet (other code/tests may import them); just stop calling
   them from the mount path. Note any now-unused imports and clean them.
5. **Write the completion/regression test** (see Acceptance) and get it passing
   **before** finalizing the fetch-all removal.

## Files likely involved

- `services/localBranches.ts` — **new**, electron-store-backed branch persistence
- `constants.ts` — replace `INITIAL_BRANCHES` with canonical data
- `context/StoreContext.tsx` — seed from local, drop `fetchBranches` from
  `loadAll`, drop `branches` realtime sub, route `addBranch`/`updateBranch` to local
- `types.ts` — reference only (no change expected; `Branch` already has the fields)
- `tests/` — new test (mirror the existing test style/runner in this folder)

## Acceptance criteria

- [ ] `loadAll()` no longer calls `db.fetchBranches()`; branches come from
      `loadLocalBranches()` and default to the 2 canonical branches with correct UUIDs.
- [ ] The `branches` realtime subscription is removed; editing a branch does not
      trigger a Supabase refetch.
- [ ] `addBranch` / `updateBranch` persist to electron-store and survive an app
      restart (and, by virtue of `userData`, an app update).
- [ ] **Completion verification test** (this task only — run with
      `npx vitest run <this-test-file>`, not the whole suite; in-memory fallback
      `NODE_ENV=test`, no disk/network; mock `db`/realtime). It must prove the new
      local method behaves the same as the old fetch-all across **every** branch
      consumer, and that changes/reloads propagate correctly.

      **Plumbing assertions:**
      - `loadLocalBranches()` returns the 2 canonical branches with exact UUIDs
        (`…0001`, `…0002`) and printer names.
      - `loadAll()` does **not** call `db.fetchBranches` (spy → 0 calls on mount);
        the `branches` realtime subscription is removed.

      **Scenario A — Parity (same output as fetch-all):** seed the local store and
      a reference dataset where `db.fetchBranches` *would* have returned the same 2
      branches, then assert each consumer derives identical output under both:
      | Consumer | Output to compare |
      | --- | --- |
      | Sidebar | branch selector list + `currentBranch` |
      | Dashboard | per-branch chart series (`rev_<id>` / `profit_<id>` keys exist for each branch) |
      | Inventory | per-branch stock columns/filter resolve every branch id |
      | Accounting | per-branch breakdown buckets |
      | SalesHistory | branch filter/labels resolve names |
      | Branches | list rows + each branch's `totalStock` / `stockValue` |
      | Settings | editable branch list |

      **Scenario B — Change shows changed output:** `updateBranch(id, { thermalPrinterName })`
      (and `addBranch`) → assert the local store updates **and** the affected
      consumers above reflect the new value.

      **Scenario C — Refetch/reload shows correct cached output:** re-hydrate from
      local storage (simulate app reopen) → assert branches/`currentBranch` and all
      consumer outputs match the last persisted state (no Supabase call).
- [ ] App runs; branch selector in the Sidebar and printer settings still work.
