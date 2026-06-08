# TODO-012: Settings — wire the existing local-first service into the fetch-all, drop `fetchSettings`

- **ID:** 012
- **Priority:** P1
- **Status:** TODO

## Description

`db.fetchSettings()` is pulled on every `loadAll`. The **`localSettings.ts`
electron-store service already exists** and is the template every other local-first
TODO references — but it is **not wired** into the mount/update path yet:
`fetchSettings()` still runs in `loadAll` [:496](../../context/StoreContext.tsx#L496)
and `updateSettings` [:1971](../../context/StoreContext.tsx#L1971) does not call
`saveLocalSettings`. This task finishes the job: wire the service, drop the fetch.

There is **no realtime subscription** for `app_settings` / `settings` (confirmed by
grep). `INITIAL_SETTINGS` is already the electron-store default, so the app works
offline from first boot.

Consumers — verified by grep:

| Consumer | Site | Reads `settings` for |
| --- | --- | --- |
| **POS** | [POS/index.tsx](../../components/POS/index.tsx) | tax rate, currency symbol, printer names |
| **Inventory** | [Inventory/index.tsx](../../components/Inventory/index.tsx) | low-stock alert threshold |
| **Settings page** | [Settings.tsx](../../components/Settings.tsx) | display + edit all fields |

All three read `settings` from `useStore()` — the global state stays; only
**how it is hydrated on mount** changes (local cache instead of Supabase fetch-all).

## The existing service (nothing to create)

`services/localSettings.ts` already provides:
- `loadLocalSettings(): AppSettings`
- `saveLocalSettings(updates: Partial<AppSettings>): AppSettings`
- `setLocalSettings(s: AppSettings): void`
- electron-store (`app_settings`) with `INITIAL_SETTINGS` defaults + in-memory test
  fallback — the pattern is already correct.

## Steps

1. **`StoreContext` — mount:** replace the `setSettings(INITIAL_SETTINGS)` default
   state initializer and the `db.fetchSettings()` / `setSettings(settingsData)` in
   `loadAll` [:496](../../context/StoreContext.tsx#L496) / [:539](../../context/StoreContext.tsx#L539)
   with a single `setSettings(loadLocalSettings())` on init. Remove
   `db.fetchSettings()` from the `Promise.all` in `loadAll`.
2. **`StoreContext` — `updateSettings`:** add `saveLocalSettings(updates)` alongside
   the existing optimistic `setSettings` [:1971](../../context/StoreContext.tsx#L1971)
   so every settings write persists locally. The Supabase write-through via
   `executeWithOfflineQueue` stays — cross-machine sync is preserved.
3. **Expose `refreshSettings()`** — calls `db.fetchSettings()` → `setSettings` +
   `setLocalSettings` (full replace, not merge). Used by the Settings page revalidate.
4. **Settings page** ([components/Settings.tsx](../../components/Settings.tsx)): call
   `refreshSettings()` once on mount (stale-while-revalidate — renders cached values
   immediately, revalidates in background); add a **Refresh** button.
5. **`refreshFromSupabase`** [:586](../../context/StoreContext.tsx#L586) — check
   whether `fetchSettings` is present there too and remove it if so (settings should
   never ride the 30s poll; local cache + explicit Refresh is the right path).
6. **Write the completion verification test** (see Acceptance) and get it passing.

## Files likely involved

- `context/StoreContext.tsx` — seed from `loadLocalSettings()`, drop `fetchSettings`
  from `loadAll` (and `refreshFromSupabase` if present), add `saveLocalSettings` to
  `updateSettings`, expose `refreshSettings`
- `components/Settings.tsx` — revalidate on open + Refresh button
- `services/localSettings.ts` — **no change** (already correct)
- `tests/` — new completion test

## Acceptance criteria

- [ ] **Completion verification test** (`npx vitest run <this-test-file>` only;
      `NODE_ENV=test` in-memory fallback; mock `db`). It must prove:

      **Plumbing:**
      - `loadAll()` does **not** call `db.fetchSettings` (spy → 0 calls on mount).
      - `loadLocalSettings()` returns `INITIAL_SETTINGS` (all fields present with
        correct default values) on a fresh store.
      - `updateSettings({ storeName: 'Test' })` calls `saveLocalSettings` AND fires
        the Supabase write-through — assert both, not just one.

      **Scenario A — Consumer parity (same output as the old fetch-all):** seed the
      local store with the same settings `db.fetchSettings` would have returned;
      assert each consumer derives identical output:
      | Consumer | Output to compare |
      | --- | --- |
      | POS | tax rate applied to cart total; currency symbol shown |
      | Inventory | `enableLowStockAlerts` flag gates the alert banner |
      | Settings page | all fields (storeName, currencySymbol, taxRate, etc.) rendered correctly |

      **Scenario B — Update shows changed output:** `updateSettings({ taxRate: 0.15 })`
      → assert POS applies the new rate, the local store returns `0.15`, and the
      Supabase write fires.

      **Scenario C — Reload/offline:** simulate app reopen → `settings` hydrate from
      `loadLocalSettings()` with **no** `db.fetchSettings` call; all consumer outputs
      match the last persisted state. With network unavailable, POS/Inventory/Settings
      all render correct values from cache.

- [ ] App runs; POS, Inventory, and Settings page all read correct settings from the
      local cache on mount; settings changes persist through app restart/update.
