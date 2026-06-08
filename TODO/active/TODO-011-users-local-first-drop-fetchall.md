# TODO-011: Users — local-first cache (electron-store), drop `fetchUsers` from the fetch-all

- **ID:** 011
- **Priority:** P1
- **Status:** TODO

## Description

`db.fetchUsers()` is pulled on every `loadAll`. There are only **3 users**, the
login check is **entirely client-side** (PIN compared in JS — no server call), and
there is **no realtime subscription** for the `users` table (confirmed: `loadAll`
only). Move `users` to an **electron-store local-first cache**, seeded with
`INITIAL_USERS` so the login page and all role guards work **offline from first
boot**, then drop `fetchUsers` from the fetch-all.

**Not local-only** (contrast with printer names in TODO-001). Users are shared
business data: a PIN reset or a new cashier added at one branch must appear on the
other machine. Supabase stays the source of truth; the local store is the cache for
instant paint + offline. CRUD writes through to Supabase.

Pattern to mirror exactly: [services/localSettings.ts](../../services/localSettings.ts)
and [TODO-008](TODO-008-suppliers-lazy-localfirst-drop-fetchall.md) (suppliers).

Consumers — verified by grep:

| Consumer | Site | Reads `users` for |
| --- | --- | --- |
| **LoginPage** | [LoginPage.tsx:13](../../components/LoginPage.tsx#L13), [:19](../../components/LoginPage.tsx#L19), [:138](../../components/LoginPage.tsx#L138) | `users.filter(role)` → user picker; `user.pin` vs entered PIN |
| **Settings** | [Settings.tsx:11](../../components/Settings.tsx#L11), [:419](../../components/Settings.tsx#L419), [:443](../../components/Settings.tsx#L443) | user list + CRUD (add / edit / delete) |
| **Sidebar + role guards** | Sidebar.tsx, Dashboard, POS, Inventory, Customers, Suppliers | `currentUser.role` checks |

## Steps

1. **Create `services/localUsers.ts`** mirroring `services/localSettings.ts` exactly:
   - `electron-store` with `try/require` guard + in-memory fallback when
     `process.env.NODE_ENV === 'test'` or electron-store unavailable.
   - Store name `app_users`, key `users`, `defaults: { users: INITIAL_USERS }`.
   - Exports: `loadLocalUsers(): User[]`, `saveLocalUsers(u: User[]): void`.
2. **Wire `StoreContext`:**
   - On init, seed `users` from `loadLocalUsers()` instead of `INITIAL_USERS`
     (already the default state at [:141](../../context/StoreContext.tsx#L141) —
     replace with the local load).
   - Remove `db.fetchUsers()` and `setUsers(usersData)` from `loadAll`
     [:495](../../context/StoreContext.tsx#L495) / [:538](../../context/StoreContext.tsx#L538).
   - In `addUser` [:1955](../../context/StoreContext.tsx#L1955),
     `updateUser` [:1959](../../context/StoreContext.tsx#L1959),
     `deleteUser` [:1963](../../context/StoreContext.tsx#L1963): keep the optimistic
     `setUsers` + `executeWithOfflineQueue` Supabase write-through; add
     `saveLocalUsers(updatedList)` so the cache stays in sync.
   - Expose a `refreshUsers()` that calls `db.fetchUsers()` → `setUsers` +
     `saveLocalUsers` (used by Settings page revalidate).
3. **Settings page** ([components/Settings.tsx](../../components/Settings.tsx)):
   call `refreshUsers()` once on mount (stale-while-revalidate — renders cached list
   immediately); add a **Refresh** button.
4. **Do not** remove `db.fetchUsers` / CRUD fns from the service layer — still used
   by the revalidate and write-through. Clean up genuinely unused imports only.
5. **Write the completion verification test** (see Acceptance) and get it passing
   before finalising the fetch-all removal.

## Files likely involved

- `services/localUsers.ts` — **new** electron-store cache (seeded with `INITIAL_USERS`)
- `context/StoreContext.tsx` — seed from local, drop `fetchUsers` from `loadAll`,
  add `refreshUsers`, write-through cache in CRUD
- `components/Settings.tsx` — revalidate on open + Refresh button
- `tests/` — new completion test

## Acceptance criteria

- [ ] **Completion verification test** (`npx vitest run <this-test-file>` only;
      `NODE_ENV=test` in-memory fallback; mock `db`). It must prove:

      **Plumbing:**
      - `loadAll()` does **not** call `db.fetchUsers` (spy → 0 calls on mount).
      - `loadLocalUsers()` returns at least the 3 `INITIAL_USERS` entries (with
        correct ids `u1`/`u2`/`u3` and PINs) on a fresh store.
      - No realtime subscription for `users` exists (already absent — assert it stays
        absent after this task).

      **Scenario A — Login parity (same output as the old fetch-all):** seed the
      local store with the same users `db.fetchUsers` would have returned; assert
      each login-path step produces identical output:
      | Step | Output to compare |
      | --- | --- |
      | Role filter | `users.filter(role === 'ADMIN')` returns the same user list |
      | PIN check | correct PIN → `login(user)` called; wrong PIN → error, no login |
      | Offline boot | `loadLocalUsers()` returns users with **no** `db.fetchUsers` call |

      **Scenario B — CRUD parity + cross-machine safety:** `addUser` / `updateUser`
      / `deleteUser` → the optimistic `setUsers` updates the list, `saveLocalUsers`
      writes the cache, **and** the Supabase write-through fires (so the other machine
      sees it on its next revalidate). A pure-local-only approach would skip the
      Supabase write — assert it is **not** skipped.

      **Scenario C — Reload/offline:** simulate app reopen → `users` hydrate from
      `loadLocalUsers()` with **no** `db.fetchUsers` call; then `refreshUsers()`
      merges fresh rows and persists. With network unavailable, the cached list still
      populates the login page.

- [ ] App runs; login page lists users and validates PINs correctly; Settings page
      user list shows, CRUD persists to Supabase and survives app restart/update.
