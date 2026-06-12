# TODO-011: Users — local-first cache (electron-store), drop `fetchUsers` from the fetch-all

- **ID:** 011
- **Priority:** P1
- **Status:** completed

## Description

`db.fetchUsers()` is pulled on every `loadAll`. There are only **3 users**, the
login check is **entirely client-side** (PIN compared in JS — no server call), and
there is **no realtime subscription** for the `users` table. Move `users` to an
**electron-store local-first cache**, seeded with `INITIAL_USERS` so the login page
and all role guards work **offline from first boot**, then drop `fetchUsers` from
the fetch-all.

Implemented on branch: TODO/users-local-first-drop-fetchall
