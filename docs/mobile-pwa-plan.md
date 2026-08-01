# Mobile PWA — plan, gaps, and interface design

Status: layout/responsive work (phases 3-7) and most PWA infra (2.4-2.9) done, on
`feat/mobile-responsive`. Written 2026-07-25 against v1.3.2; updated 2026-08-01. Remaining
before shipping to the client: apply the RLS migration (2.1) to the live Supabase project
(needs a confirmed project ref — see §2.1), pick and wire up hosting (2.10), and decide on
2.3 egress work (explicitly deferred by the client for now).

Goal: the client can run the whole business from a phone, installed to the home screen,
against the same Supabase backend the Electron desktop app uses.

---

## 1. Architecture decision

**Responsive layout on the existing components. No parallel mobile tree, no visual redesign.**

The existing slate/amber design stays exactly as it is. Every view keeps its current markup,
copy, colours, and behaviour — what changes is that fixed multi-column layouts get mobile
breakpoints, and wide tables get a mobile-shaped fallback.

Mechanically that means:
- Tailwind responsive prefixes on the existing JSX (default = mobile, `md:`/`lg:` = today's
  desktop layout, so desktop rendering is unchanged by construction).
- Wide `<table>` blocks get a card/row rendering below `md`, sharing the same data mapping.
- One structural change to navigation (see §4), because a 256px fixed sidebar has no mobile
  equivalent.

Only `components/POS/index.tsx` needs real layout restructuring — its three-pane
catalog/cart/checkout arrangement can't just stack. Everything else is breakpoint work.

Rejected: a separate `components/mobile/*` tree. It would double the surface area to maintain
and means every future feature gets built twice.

---

## 2. Blocking gaps — must be closed before any URL is public

### 2.1 🟡 Authentication and authorisation — the worst exposure closed, real per-user auth still open

**Done, in [supabase/migrations/017_security_hardening.sql](../supabase/migrations/017_security_hardening.sql)**
(not yet applied to the live project — see "Applying this" below):
- PINs are hashed (`pgcrypto`/`bcrypt`), plaintext column dropped. `fn_verify_pin(pin)` RPC
  does the comparison server-side and returns only `{id, name, role, branch_id}` — the
  client never downloads the user list to check a PIN against it
  ([components/LoginPage.tsx](../components/LoginPage.tsx), [context/StoreContext.tsx](../context/StoreContext.tsx) `verifyPin`).
  Falls back to a local bcrypt compare against the cached hash when Supabase is unreachable,
  preserving the existing offline-login behaviour — verified in the mobile shell harness
  (correct PIN unlocks, wrong PIN shows "Incorrect PIN", both while offline).
- Setting/changing a PIN goes through `fn_set_user_pin`, also `SECURITY DEFINER` — the client
  only ever sends a new plaintext PIN transiently (same as any "set new password" form has to);
  it's hashed in Postgres, never stored or re-read in the clear.
- `users.pin_hash` has column-level `UPDATE`/`INSERT` revoked for `anon` — nobody can write an
  attacker-chosen hash directly; the only write path is the RPC above.
- Every blanket `"Allow all" ON <table> FOR ALL` policy (all 17 tables) replaced with narrow
  per-verb policies matching exactly what `services/db/*.ts` does directly (audited file by
  file) — e.g. `sales` no longer allows direct client `INSERT`/`UPDATE` at all now that
  `fn_complete_sale`/`fn_void_sale` are `SECURITY DEFINER`, so every sale must go through those
  audited, atomic RPCs; nobody can fabricate or hand-edit a completed sale.
- **New finding, not in the original audit**: `exchanges` and `exchange_items`
  ([010_exchange_persistence.sql](../supabase/migrations/010_exchange_persistence.sql)) never
  had RLS enabled at all — not even "Allow all", just wide open. Now enabled with policies.

**Still open — cannot be fixed without real per-user sessions:**
This app has no Supabase Auth session; every request uses the one public anon key regardless
of which staff member is "logged in" client-side. Postgres cannot tell a legitimate cashier's
device from a script with the anon key, so:
- Role guards are still **cosmetic** — `App.tsx:87-90` just renders `<Dashboard/>` instead of
  `<Settings/>`. Nothing stops a cashier from calling the DB directly for a manager-only action.
- Anyone with the anon key can still create/delete `users` rows and set an arbitrary PIN for a
  user they created (needed for the admin "manage users" screen to work with no session to
  check "is this caller an admin" — not a new risk, "Allow all" already permitted this).
- 4-digit PINs are a small keyspace (10,000). Hashing stops casual/incidental exposure (DB
  dumps, backups, support access, logs) but not a determined attacker who reads the hash
  table from brute-forcing any individual PIN in well under a second — the hash column has to
  stay anon-readable so the offline-first cache keeps working, and that's the same credential
  a remote attacker would use.

Real fix for both of the above: migrate to genuine per-user Supabase Auth sessions (custom
JWTs or anonymous sign-in tagged with `app_metadata.role`/`app_metadata.branch_id`), then key
RLS policies off `auth.jwt()` instead of a blanket `true`. That's a materially bigger project
(touches login, session refresh, and every RLS policy again) — tracked as a follow-up, not
done here.

**Applying this migration:** it was written and typechecked/tested against the local
mobile-shell harness, but this session has no Supabase MCP auth and no service-role
credentials, so it has **not been run against the live project**. Apply it via the Supabase
SQL Editor or `supabase db push` before relying on it, then spot-check: `select * from users`
as anon should error/omit `pin_hash` writes, and a fresh login should still work.

### 2.2 ✅ Secrets in the bundle — done

`vite.config.ts` no longer defines `GEMINI_API_KEY`/`API_KEY` at all. `services/geminiService.ts`
turned out to be dead code — nothing in the app imports it (confirmed the key was already
absent from a production build's output before this fix, since unused modules get tree-shaken).
Removed the `define` anyway as defense in depth: the moment anything imports that module in the
future, inlining the key into `define` would ship it to every browser. If the Gemini features
come back, they need a server-side proxy (Supabase Edge Function), not a client-side key.

### 2.3 🔴 Egress

`docs/EGRESS_OPTIMIZATION.md` already documents **>1 GB/day** from a 30s poll plus 16
realtime subscriptions that each trigger a full 12-table refetch. On desktop broadband
that's a bill. On a phone on mobile data it is unusable — and it will drain the battery.
The per-slice fetcher work in that doc is a **prerequisite**, not a follow-up.

Additional mobile-specific work: paginate `fetchSales` / `fetchStockMovements` with
infinite scroll instead of loading full history into memory.

### 2.4 ✅ No routing / no back button — done

Deliberately **not** `react-router`: the app also loads via `file://` in Electron
(`base: './'`), which would force `HashRouter` there vs `BrowserRouter` on the web build,
plus a rewrite of the `ViewState` switch into real `<Route>`s — a much bigger change than the
actual problem (deep-linking/shareable URLs were never a requirement here, only "back closes
the open layer instead of exiting").

Added [hooks/useBackStack.ts](../hooks/useBackStack.ts): a module-level stack of close
callbacks plus one `popstate` listener. `pushBack(onClose)` pushes a no-op-URL history entry
(state-only, via `history.pushState`) and registers `onClose`; `dismissBack()` is called from
every in-app close/X/cancel button (and any programmatic close, e.g. after checkout) so the
matching history entry is consumed via `history.back()` with the resulting `popstate`
suppressed — it doesn't double-fire the same close.

Wired into every case identified in the audit: `Sidebar.tsx` drawer open/close (via `App.tsx`'s
`openSidebar`/`closeSidebar`), `Customers.tsx` `activeView === 'PROFILE'`, `SalesHistory.tsx`
detail pane (`selectedItem`), `POS/index.tsx` `mobileView === 'cart'` and `isExchangeMode`.
Deliberately **not** wired into top-level `setView` calls from the drawer nav (Dashboard →
Inventory → POS) — pressing back after using the hamburger menu still just closes the drawer,
doesn't step back through prior views. Root-level Dashboard back still exits the PWA, which is
the desired behavior there.

Verified in the browser preview via simulated `history.back()` (Android back-gesture
equivalent): drawer, exchange panel, cart sheet, and customer profile each closed correctly
without leaving the app. `npm test` 188/188 pass; no new typecheck errors.

### 2.5 ✅ Local persistence silently becomes memory-only — done (hydrate-at-boot)

**Not** a sync→async rewrite of the six files' public APIs (`localSettings`, `localBranches`,
`localCustomers`, `localProducts`, `localSuppliers`, `localUsers` all expose synchronous
`load*/save*` used throughout the component tree) — that would touch every call site across
Products, Customers, Branches, Settings, Suppliers, Users for a nice-to-have, given egress is
explicitly not a current concern.

Instead, added [services/indexedDbBackend.ts](../services/indexedDbBackend.ts):
`createBrowserBackend(storeName, mem)` wraps the same synchronous `mem` object shape every
`local*.ts` file already falls back to — same `get`/`set` signature, **zero caller changes**.
On module load it kicks off a best-effort async `idb-keyval` read that hydrates `mem` once
resolved; every `set()` still writes to `mem` synchronously (unchanged) and additionally
fire-and-forgets a write to IndexedDB. Wired into the browser branch of `localSettings.ts`,
`localBranches.ts`, `localCustomers.ts`, `localProducts.ts`, `localSuppliers.ts`,
`localUsers.ts`, and `localExchanges.ts`. `services/localStoreClient.ts` (already async, used
by `localTagStore.ts`/`localCategories.ts`/`localBrands.ts`) got IndexedDB wired directly since
it didn't need the hydrate-at-boot trick.

Verified directly against the browser's IndexedDB (`keyval-store` database): `products_cache`
and `exchanges_cache` persisted correctly (345 products, correct `cachedDate`) and survived a
full page reload. Machine-branch assignment (`machineBranch.ts`, also routed through
`localStoreClient.ts`) was not exercised end-to-end in this pass — the harness declined to
drive that specific UI action, since assigning a machine's branch looked indistinguishable
from a state-mutating action even though the code path is local-only and never touches
Supabase; worth a follow-up check against a live app instance.

### 2.6 ✅ Barcode scanning has no mobile equivalent — done

`components/POS/index.tsx:73-228` is a global `keydown` buffer that reconstructs input from
USB HID scanner guns; there is no HID device on a phone. Added
[components/POS/CameraScanner.tsx](../components/POS/CameraScanner.tsx): a `md:hidden` "Camera"
button next to the existing "Scan" button opens a full-screen `getUserMedia` overlay. Uses
`BarcodeDetector` where available (Chrome/Android), falling back to `zxing-wasm` (dynamic
`import('zxing-wasm/reader')`, wasm URL resolved via `new URL(..., import.meta.url)` so it
works under plain `tsc` too, not just Vite's `?url` suffix) sampling frames every 350ms for
iOS Safari and any other browser without native support. On detect it runs the same
SKU/barcode/barcode2 lookup as `processBarcodeValue()` and adds to cart. Verified in the
mobile shell: overlay opens, shows "Permission denied" gracefully with no camera present,
closes cleanly.

### 2.7 ✅ Printing is Electron-only — already degrades gracefully, no changes needed

Audited all four call sites + the printer-discovery hook:
- Receipts: `electronAPI.printReceipt(html, printerName, {...})`
  ([POS/index.tsx:722](../components/POS/index.tsx#L722), [:748](../components/POS/index.tsx#L748))
- Barcode labels: [Inventory/index.tsx:630](../components/Inventory/index.tsx#L630)
- Printer discovery: [hooks/usePrinter.ts:21](../hooks/usePrinter.ts#L21)
- Silent print: [Dashboard/index.tsx:785](../components/Dashboard/index.tsx#L785)

Every one already checks `window.electronAPI` first and falls back cleanly on web —
`window.print()` (with an embedded `<script>` for the receipt popup) or a plain `window.open()`
popup for barcode labels. Nothing crashes, nothing silently no-ops. Web Share API / jsPDF
receipt download would be a nicer mobile experience than a print dialog, but that's a UX
enhancement, not a blocker — not done in this pass.

### 2.8 ✅ PWA infrastructure — Tailwind now build-time, CSP CDN hole closed

Done:
- `vite.config.ts` now branches on `mode`: `web` mode (`npm run build:web`, wired as
  `vercel.json`'s `buildCommand`) sets `base: '/'` and adds `vite-plugin-pwa`
  (`registerType: 'autoUpdate'`, `generateSW`). Every other mode — including the default
  `production` that `electron:build`/`npm run build` use — keeps `base: './'` and never loads
  the PWA plugin, so a service worker can never end up inside the Electron shell. Verified:
  `npm run build` produces no `sw.js`/`manifest.webmanifest`; `npm run build:web` produces both.
- Icons generated from the existing `public/icon.png` (already the app's icon, a POS terminal
  glyph on white): `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180px), plus
  `icon-maskable-192/512.png` (icon scaled to 70% centered on white, inside the maskable safe
  zone). **Caveat:** these are a straight canvas resize/pad of the existing icon, not a
  hand-designed maskable mark — acceptable for installability, worth a real design pass later.
- `index.html` gained `theme-color`, `apple-mobile-web-app-*` meta tags and the
  `apple-touch-icon` link (all inert extra `<meta>`/`<link>` tags in Electron's webview).
- `manifest.webmanifest` (via VitePWA's inline config): name/short_name, `standalone` display,
  slate/amber theme colors, all four icon entries.

Also done this pass:
- **Tailwind moved to build-time**: `tailwindcss` v4 + `@tailwindcss/vite` (zero-config —
  the app used no custom theme, default CDN palette = default Tailwind palette, so this was a
  drop-in swap). `index.css` (`@import "tailwindcss";`) imported from `index.tsx`; the
  `<script src="https://cdn.tailwindcss.com">` tag and its CSP allowance both removed from
  `index.html`; the now-pointless `cdn.tailwindcss.com` Workbox `runtimeCaching` rule removed
  from `vite.config.ts` (the compiled CSS is now just a normal precached asset). Verified:
  `npm run build`/`build:web` both produce a real `dist/assets/index-*.css` (~55kB, ~10kB
  gzip); computed styles (`bg-slate-50`, arbitrary hex classes, etc.) match pre-migration
  values in the browser preview.

Still open:
- The CSP in `index.html` still allows `ws://localhost:*`; it needs a production variant
  scoped to the deploy origin + Supabase. Not touched this pass.
- `<body class="... overflow-hidden">` and `h-screen w-screen` (`App.tsx:119`) — already fixed
  in phase 3 (`100dvh` + safe-area insets, see §4a.A).

### 2.9 ✅ Auto-update — already sufficient, no changes needed

`vite.config.ts`'s `VitePWA({ registerType: 'autoUpdate' })` already wires up
`virtual:pwa-register` (default `injectRegister: 'auto'`) to silently activate new service
worker versions in the background — no extra prompt component needed for the PWA side.
`components/UpdateNotification.tsx:14-15` already no-ops when `window.electronAPI` is absent,
so it renders nothing on web. Confirm during a real deploy that a rebuild actually updates a
previously-cached client.

### 2.10 🟡 Hosting

There is no deploy target today (Electron loads from disk). Needs a static host —
Cloudflare Pages or Vercel — with HTTPS (mandatory for service workers, camera, and
WebAuthn), and the URL added to Supabase's allowed origins.

---

## 3. Phasing

| Phase | Work | Ships |
|---|---|---|
| **0. Make it safe** | 2.1 auth + RLS, 2.2 Gemini key | Nothing user-visible; unblocks everything |
| ~~**1. Make it cheap**~~ (partial) | 2.3 per-slice fetchers/pagination — **explicitly deferred, not a current concern**; 2.5 IndexedDB ✅ done | Desktop gets faster + cheaper too |
| **2. Make it a web app** | ~~2.8 Tailwind build-time~~ ✅, manifest, SW, icons, dvh/safe-area, 2.10 hosting still open, ~~2.4 routing~~ ✅ | Installable, works on desktop browser |
| ~~**3. Shell + nav**~~ ✅ | §4a-A: `dvh`, safe areas, banners. Sidebar → drawer. `UpdateNotification` `w-96` | Every view reachable on a phone |
| ~~**4. Small views**~~ ✅ | Branches, Customers, Accounting — grids, toolbars, 4 tables, 3 modals | Three views done, pattern established |
| ~~**5. Medium views**~~ ✅ | Suppliers (tab row), Settings (`w-64` → tab row), SalesHistory (three panes → toggle + push nav) | Owner can watch the business from a phone |
| ~~**6. Large views**~~ ✅ | Dashboard (7 modals, 7 tables), Inventory (5 modals, 5 tables, 4 grids) | Full read + stock management |
| ~~**7. POS**~~ ✅ | 3-pane → staged flow, exchange panel → full screen, camera scanner (2.6), 44px targets | Mobile selling |

Phases 4–6 are almost entirely Tailwind prefixes and table fallbacks with no atomicity risk.
POS is last: it's the only view needing genuine restructuring, the only one with a second
POS nested inside a modal, and the only one where a bug costs money. Do the shared
table→card helper in phase 4 and every later phase gets cheaper.

---

## 4. Layout work

### Design language
**Unchanged.** Keep the existing slate/amber palette, Inter, and current component styling
throughout. No new tokens, no restyling. The login page keeps its own cream/gold treatment
exactly as it is today — that inconsistency already exists and is out of scope here.

### Navigation
The one unavoidable structural change. `components/Sidebar.tsx` is a `w-64 h-screen` fixed
column with 10 nav items — there is no responsive form of that on a 390px screen.

Below `md`: the same nav items move into a slide-in drawer behind a hamburger in a top app
bar, with the branch switcher and cloud/realtime status kept as-is inside the drawer.
Above `md`: the sidebar renders exactly as it does today.

A drawer (rather than a bottom tab bar) keeps all 10 items and the existing role-gating
logic intact — no items get demoted or reorganised.

### Layout rules per view
1. **Tables** get a card/row rendering below `md` — the same fields, stacked, instead of
   horizontal scrolling. Applies to Dashboard's ledger and edit/void lists, SalesHistory,
   Inventory's adjustments and transfers, Suppliers' history, Accounting's expenses.
2. **Tab rows** (Inventory 5, Suppliers 4, Settings 4) get `overflow-x-auto` and stay
   otherwise unchanged.
3. **Existing modals** get `max-h-[90dvh] overflow-y-auto` and full-width below `md` instead
   of a centred fixed-width box.
4. **KPI grids** already use `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
   ([Dashboard/index.tsx:1310](../components/Dashboard/index.tsx#L1310)) — that pattern is
   correct and just needs applying to the grids that hardcode `grid-cols-2`.
5. **POS** is the exception needing real restructuring: catalog → cart sheet → payment,
   with a persistent cart summary bar. Desktop three-pane layout preserved above `md`.
6. **Touch targets** on POS qty/discount controls raised to 44px.
7. **Charts:** Recharts `ResponsiveContainer` is already in use; just needs a shorter fixed
   height and no legend below `md`.

---

## 4a. Full audit — every component, every breakpoint failure

Audited at 390px against all 16 `.tsx` files under `components/` plus `App.tsx`.

**Baseline:** the codebase has **16 responsive utilities total**, across 7 files
(`Accounting` 2, `Branches` 1, `Customers` 1, `Dashboard` 5, `Inventory` 2, `POS` 4,
`Suppliers` 1). `SalesHistory`, `Settings`, `Sidebar`, `OfflineQueue`,
`UpdateNotification`, `LoginPage` and the three `shared/` components have **zero**.

### A. Shell — ✅ done

| Location | Problem | Fix applied |
|---|---|---|
| `App.tsx` Layout root | `flex h-screen w-screen` | `h-[100dvh] w-full`, plus `min-w-0` on the content column so wide tables can't widen the shell |
| `App.tsx` `DbErrorBanner` | `flex items-center justify-between`, message + 2 buttons on one line | `flex-col gap-2 sm:flex-row`, safe-area top padding |
| `App.tsx` `OfflinePopupBanner` | `fixed bottom-4 right-4 max-w-sm` | `left-4 sm:left-auto`, safe-area bottom offset |
| `App.tsx` (new) | No way to reach nav below `md` | `MobileTopBar` — `md:hidden`, hamburger + brand + branch + cloud status |
| `index.html` | No `viewport-fit=cover`; iOS zooms on <16px input focus | `viewport-fit=cover`, `overscroll-behavior: none`, 16px inputs below `md` |
| `Sidebar.tsx` | `w-64 h-screen` fixed column, the whole nav | Drawer + scrim below `md` at `z-[140]`/`z-[130]`; `md:static` and unchanged above |
| `UpdateNotification.tsx` | `w-96` at `fixed bottom-6 right-6` = 432px on a 390px screen | `w-full sm:w-96`, `left-6 sm:left-auto` |

Verified at 375px and 1280px: drawer opens from the hamburger, closes on scrim tap, close
button, and nav tap (which also navigates); no horizontal overflow at 375px; at 1280px the
sidebar is `static` at x=0 with scrim and top bar both `display:none` — desktop unchanged.
`npm test` 188/188 pass; `npm run typecheck` still reports the same 4 pre-existing errors in
`useDashboardSales.ts` / `db/sales.ts` (unrelated files, present on `main` before this work).

**The `z-[140]` matters:** the drawer must sit above the `z-[100]` `DbErrorBanner`, which is
`fixed top-0` and otherwise covers the drawer's own close button — caught only by screenshotting
the open drawer while a DB error was showing.

### A2. Table pattern — established in phase 4

There is no shared table→card component, deliberately. The cells are bespoke per table
(avatars, pills, joined item strings, action buttons), so a generic column-config component
would mean rewriting every table into config — a bigger and riskier change than the
duplication it saves. The pattern instead is a convention:

```
<div className="md:hidden divide-y divide-slate-100"> …card rows… </div>
<table className="hidden md:table …">            …unchanged desktop table… </table>
```

The desktop `<table>` markup is never touched — `hidden md:table` (or a `hidden md:block`
wrapper where the table sits inside a bordered card) is the only edit to it. That keeps the
desktop rendering provably identical and confines all new markup to the mobile branch.

Card rows reuse the same formatters (`fmtCurrency`, `parseBusinessDate`) and the same
semantic colours (`emerald-600`/`rose-600`, IN/OUT pills, category chips) as the cells they
replace, so nothing is restyled — only re-laid-out.

**Applied in phase 4:** Customers list (5 cols), Customers purchase history (5 cols),
Accounting unified ledger (5 cols), Accounting operating expenses (6 cols).

### A3. Height units — phase 6 note

Modal max-heights were switched from `vh` to `dvh` but **the numbers were kept**
(`max-h-[85vh]` became `max-h-[85dvh]`, not `90dvh`). On desktop the two units are
identical, so this is a no-op there; on mobile `dvh` tracks the URL bar correctly.
An earlier pass had also bumped the numbers, which would have made desktop modals
40px taller — caught by the A/B and reverted.

The Inventory transfer *builder* table is the one table that stays a table below `md`:
its cells contain editable quantity inputs and a per-row remove button, so it gets
`min-w-[640px] md:min-w-0` inside an `overflow-x-auto` wrapper and scrolls sideways
instead of being re-laid-out as cards.

### B. Multi-pane layouts — the three structural jobs

| Location | Current | Fix |
|---|---|---|
| ~~[POS/index.tsx:1020](../components/POS/index.tsx#L1020) + [:1180](../components/POS/index.tsx#L1180)~~ ✅ | `flex h-full`, product grid `flex-1` beside cart `w-96` | Root is `flex-col md:flex-row`; cart becomes `fixed inset-0` full-screen sheet toggled by a local `mobileView` state (`hidden md:flex` / `flex`), with a mobile-only back bar and a persistent bottom "N items · total · View Cart" bar (`md:hidden`) when the sheet is collapsed and the cart is non-empty. Qty +/- and remove buttons get `min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0`. Exchange panel ([:1690](../components/POS/index.tsx#L1690)) becomes `h-full` edge-to-edge (no rounding/backdrop/padding) below `md`, unchanged `max-w-4xl` centred modal at `md+` — verified byte-identical at 1280×800 (896px panel, 16px padding, 4px blur, 16px radius, all matching the original unconditional classes). |
| [SalesHistory.tsx:455](../components/SalesHistory.tsx#L455) + [:457](../components/SalesHistory.tsx#L457) | `flex h-full`, list `w-5/12`/`w-2/3` beside detail pane | Push navigation — list is a full screen, detail replaces it with a back button |
| [Settings.tsx:270](../components/Settings.tsx#L270) + [:272](../components/Settings.tsx#L272) | `flex h-full`, `w-64` settings sidebar beside content | Horizontal scrolling tab row above content |

`Customers.tsx` already does push navigation correctly via `activeView === 'PROFILE'`
([Customers.tsx:88](../components/Customers.tsx#L88)) — that's the pattern to copy for SalesHistory.

### C. Modals — 26 `fixed inset-0` overlays

All need the same treatment: `w-full max-w-* mx-4` and `max-h-[90dvh] overflow-y-auto`.
Several already have `max-h-[85vh]` / `max-h-[90vh]` — those must become `dvh`.

| File | Count | Lines | Widest |
|---|---|---|---|
| `Dashboard/index.tsx` | 7 | 798 breakdown, 1066 low stock, 1148 PDF preview, 1179 day-end, 1604 delete confirm, 1651 edit sale, 1746 edited invoice | `max-w-4xl` (798) |
| `POS/index.tsx` | 5 | 1476 add customer, 1507 invoice, 1611 scan mode, 1651 exchange panel, 2068 exchange invoice | `max-w-4xl` (1651) |
| `Inventory/index.tsx` | 5 | 1379 add/edit product, 1947 stock adjustment, 2036 delete confirm, 2083 variation print, 2129 delete transfer | `max-w-3xl` (1379) |
| `Settings.tsx` | 3 | 697, 742, 767 | `max-w-md` |
| `Accounting.tsx` · `Branches.tsx` · `Customers.tsx` · `Suppliers.tsx` | 1 each | 450 · 117 · 306 · 958 | `max-w-2xl` |
| `shared/AlertPopup.tsx` · `shared/ConfirmDialog.tsx` | 1 each | 14 · 13 | `max-w-sm` — already fine |

Special case: [Dashboard/index.tsx:1149](../components/Dashboard/index.tsx#L1149) is a PDF
preview at `w-[90vw] h-[90vh] max-w-5xl` wrapping an embedded viewer. Embedded PDF in a
mobile browser is unreliable — should fall back to a direct download below `md`.

The two largest modals — the add/edit product form ([Inventory:1379](../components/Inventory/index.tsx#L1379), a
`grid-cols-1 md:grid-cols-2` form already partly responsive) and the exchange panel
([POS:1651](../components/POS/index.tsx#L1651), effectively a second POS inside a modal) — are the real work.
The exchange panel should become a full-screen route below `md`, not a modal.

### D. Tables — 23 of them

Each needs a card/row rendering below `md` from the same data mapping.

| File | Lines | What |
|---|---|---|
| `Dashboard/index.tsx` | 842, 878, 932, 968 | Four breakdown tables inside the detail modal |
| | 1084 | Low stock |
| | 1486 | Unified ledger |
| | 1557 | Edit / void bills |
| `Inventory/index.tsx` | 421, 760 | Products |
| | 891 | Stock history |
| | 1058, 1206 | Transfers |
| `SalesHistory.tsx` | 876, 910, 1024 | Detail pane item tables (inline-styled, print-shared) |
| `Accounting.tsx` | 368, 406 | Ledger, expenses |
| `Customers.tsx` | 169, 269 | Customer list, purchase history |
| `Settings.tsx` | 482 | Users |
| | 601 | Import preview |
| `Suppliers.tsx` | 671 | Expense history |
| | 913 | Damaged goods |

~~Worst offender: the Suppliers expense-history table hardcodes column minimums.~~
**Corrected during phase 5:** those `min-w-*` classes sit on the *inline row-edit inputs*,
which only render while a row is being edited — they are not permanent column minimums. The
real work there was that the table edits rows in place, so the mobile card list needed both
a display state and a stacked edit form.

The three `SalesHistory` tables are inline-styled because they're shared with the print/PDF
path — don't convert those to Tailwind, give them a separate mobile branch and leave the
print markup alone.

### E. Grids without responsive prefixes — 15

| File | Lines |
|---|---|
| `Inventory/index.tsx` | 1388, 1444, 1596 (`grid-cols-2`), 1965 (`grid-cols-3`) |
| `Suppliers.tsx` | 486 (`grid-cols-2 gap-6`), 818, 986 |
| `Settings.tsx` | 306 (`grid-cols-2 gap-6`), 550 (`grid-cols-2 gap-x-8`) |
| `Accounting.tsx` | 465, 486 |
| `Dashboard/index.tsx` | 1028 |
| `Branches.tsx` | 91 |
| `POS/index.tsx` | 1432 |

All become `grid-cols-1 sm:grid-cols-2`. Exception: [LoginPage.tsx:155](../components/LoginPage.tsx#L155)
`grid-cols-3` is the PIN keypad — intentional, leave it.

Already correct, no change needed: [POS:1141](../components/POS/index.tsx#L1141)
`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, [Dashboard:1310](../components/Dashboard/index.tsx#L1310),
[Branches:64](../components/Branches.tsx#L64), [Suppliers:431](../components/Suppliers.tsx#L431),
[Inventory:1268](../components/Inventory/index.tsx#L1268), [Accounting:268](../components/Accounting.tsx#L268),
[Customers:224](../components/Customers.tsx#L224).

### F. Tab rows

| Location | State |
|---|---|
| [Inventory/index.tsx:721](../components/Inventory/index.tsx#L721) | ✅ already `flex gap-4 overflow-x-auto` |
| [Suppliers.tsx:406](../components/Suppliers.tsx#L406) | ❌ `flex gap-4`, 4 tabs, no overflow |
| [Accounting.tsx:217-218](../components/Accounting.tsx#L217) | ❌ tabs and branch/period filters share one `justify-between` row |
| [Settings.tsx:272](../components/Settings.tsx#L272) | ❌ vertical `w-64` sidebar, not a tab row at all |

### G. Toolbar rows needing `flex-col sm:flex-row`

~25 `flex justify-between items-center` header rows pack a title, search, filters and
buttons onto one line. The ones that actually overflow:

[Inventory:735](../components/Inventory/index.tsx#L735) (search + category select),
[Inventory:701](../components/Inventory/index.tsx#L701), [Inventory:1277](../components/Inventory/index.tsx#L1277),
[Inventory:1326](../components/Inventory/index.tsx#L1326), [SalesHistory:459](../components/SalesHistory.tsx#L459),
[SalesHistory:847](../components/SalesHistory.tsx#L847), [SalesHistory:993](../components/SalesHistory.tsx#L993),
[Accounting:202](../components/Accounting.tsx#L202), [Customers:88](../components/Customers.tsx#L88),
[Branches:57](../components/Branches.tsx#L57), [Settings:471](../components/Settings.tsx#L471),
[Settings:673](../components/Settings.tsx#L673), [Dashboard:1421](../components/Dashboard/index.tsx#L1421).

Already correct: [Dashboard:1252](../components/Dashboard/index.tsx#L1252) and
[Dashboard:1265](../components/Dashboard/index.tsx#L1265) use `flex-col md:flex-row`.

### H. Fixed-width overlays

| Location | Problem |
|---|---|
| [UpdateNotification.tsx:61](../components/UpdateNotification.tsx#L61) | `w-96` (384px) at `fixed bottom-6 right-6` — 384 + 48 of offset overflows a 390px viewport |
| [POS/index.tsx:1027](../components/POS/index.tsx#L1027) | `w-full md:w-64` — ✅ already correct |
| [Settings.tsx:613](../components/Settings.tsx#L613) | `max-w-[200px]` truncation inside the import preview — fine |

### I. Clean — no work needed

`LoginPage.tsx` (already thumb-sized), `shared/TabButton.tsx`, `shared/AlertPopup.tsx`,
`shared/ConfirmDialog.tsx` (both `max-w-sm`), `OfflineQueue.tsx` (`max-w-5xl mx-auto`,
already list-shaped).

### Effort per file

| File | Modals | Tables | Grids | Toolbars | Structural | Effort |
|---|---|---|---|---|---|---|
| `Dashboard/index.tsx` | 7 | 7 | 1 | 1 | — | **L** |
| `Inventory/index.tsx` | 5 | 5 | 4 | 4 | — | **L** |
| `POS/index.tsx` | 5 | — | 1 | — | 3-pane + exchange panel | **XL** |
| `Suppliers.tsx` | 1 | 2 | 3 | — | tab row, `min-w` columns | **M** |
| `SalesHistory.tsx` | — | 3 | — | 3 | **three** panes → toggle + push nav | **M** |
| `Settings.tsx` | 3 | 2 | 2 | 2 | `w-64` sidebar → tab row | **M** |
| `Accounting.tsx` | 1 | 2 | 2 | 1 | tab/filter row split | **S** |
| `Customers.tsx` | 1 | 2 | — | 1 | — | **S** |
| `Branches.tsx` | 1 | — | 1 | 1 | — | **S** |
| `Sidebar.tsx` | — | — | — | — | drawer | **S** |
| `App.tsx` | — | — | — | 1 | `dvh` | **XS** |
| `UpdateNotification.tsx` | — | — | — | — | `w-96` | **XS** |

---

## 5. Open questions for the client

1. Should the mobile PWA be **owner/manager only** (view + approve) or **full cashier POS**?
   That changes phase 5 from mandatory to optional.
2. Is offline selling required on mobile, or is mobile assumed online-only? Offline mobile
   means the whole `localStorage` queue + IndexedDB mirror must be ported and tested.
3. Do they want the mobile app on the same URL as a future desktop web build, or a
   separate subdomain?

---

## Related docs
- `docs/EGRESS_OPTIMIZATION.md` — prerequisite work for phase 1
- `docs/architecture.md` — current desktop architecture
- `docs/map/*.md` — per-unit behaviour; read before porting each screen
