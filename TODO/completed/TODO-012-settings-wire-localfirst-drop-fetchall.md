# TODO-012: Settings — wire the existing local-first service into the fetch-all, drop `fetchSettings`

- **ID:** 012
- **Priority:** P1
- **Status:** completed

## Description

`db.fetchSettings()` is pulled on every `loadAll`. The **`localSettings.ts`
electron-store service already exists** and is the template every other local-first
TODO references — but it is **not wired** into the mount/update path yet:
`fetchSettings()` still runs in `loadAll` and `updateSettings` does not call
`saveLocalSettings`. This task finishes the job: wire the service, drop the fetch.

Implemented on branch: TODO/settings-wire-localfirst-drop-fetchall
