# Mobile PWA — plan, gaps, and interface design

Status: **proposal**, not yet started. Written 2026-07-25 against v1.3.2.

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

### 2.1 🔴 Authentication and authorisation (the hard blocker)

- Login is a **client-side array scan**: `users.find(u => u.pin === pinCode)`
  ([components/LoginPage.tsx:36](../components/LoginPage.tsx#L36)). Every user's PIN is
  downloaded to the browser to make this work.
- PINs are **plaintext** in Postgres: `pin TEXT NOT NULL DEFAULT '0000'`
  ([supabase/migrations/001_initial_schema.sql:32](../supabase/migrations/001_initial_schema.sql#L32)).
- **Every table is world-writable by the anon key**:
  `CREATE POLICY "Allow all" ON <table> FOR ALL USING (true) WITH CHECK (true)` for all 17
  tables ([001_initial_schema.sql:304-317](../supabase/migrations/001_initial_schema.sql#L304-L317),
  plus `damaged_goods` and `stock_transfers` in 002/003).
- Role guards are **cosmetic** — `App.tsx:87-90` just renders `<Dashboard/>` instead of
  `<Settings/>`. Nothing stops a cashier from calling the DB directly.

On a LAN-only desktop install this is a risk you've absorbed. The moment the app is a public
URL, **anyone who finds it can read and delete the entire company database from a browser
console.** This is the single item that makes everything else moot.

Fix, in order:
1. Migrate `users` to Supabase Auth. Options: (a) email/password per staff member with the
   PIN kept as a fast local re-auth after first login (recommended — keeps the PIN UX),
   or (b) an Edge Function `POST /auth/pin` that verifies a `pgcrypto`-hashed PIN and mints
   a session. Either way the PIN must never leave the server for comparison.
2. Hash existing PINs (`crypt(pin, gen_salt('bf'))`), drop the plaintext column.
3. Replace all `"Allow all"` policies with real ones keyed on `auth.uid()` and a
   `user_roles` / `user_branches` mapping. Cashiers: read products, write sales for their
   branch. Managers: + suppliers, accounting. Admin: all.
4. Make the RPCs (`fn_complete_sale`, `void_sale`) `SECURITY DEFINER` with an explicit
   role check inside, so the privileged paths stay privileged.
5. Add a session timeout + PIN re-lock on resume — a phone gets left on a counter.

### 2.2 🔴 Secrets in the bundle

`vite.config.ts:18-19` inlines `GEMINI_API_KEY` into the client bundle via `define`.
Shipping that as a public website publishes the key. Move Gemini calls
(`services/geminiService.ts`) behind a Supabase Edge Function.

### 2.3 🔴 Egress

`docs/EGRESS_OPTIMIZATION.md` already documents **>1 GB/day** from a 30s poll plus 16
realtime subscriptions that each trigger a full 12-table refetch. On desktop broadband
that's a bill. On a phone on mobile data it is unusable — and it will drain the battery.
The per-slice fetcher work in that doc is a **prerequisite**, not a follow-up.

Additional mobile-specific work: paginate `fetchSales` / `fetchStockMovements` with
infinite scroll instead of loading full history into memory.

### 2.4 🟠 No routing / no back button

`App.tsx:92` is a `switch` on a `ViewState` string with no URL and no history entries.
On Android the hardware/gesture back button will **exit the installed PWA** from any screen.
Needs `react-router` (or a history-backed view stack) with a route per view, plus
sheet-open states pushed as history entries so back closes the sheet.

### 2.5 🟠 Local persistence silently becomes memory-only

`services/localStoreClient.ts:12-17` falls back to an in-process `mem` object when
`window.electronAPI.localStore` is absent. In a browser that means `machineBranch`,
cached products, customers, settings and users are **lost on every refresh** — the app
will full-sync from Supabase on each load, compounding 2.3.

Add an IndexedDB backend (idb-keyval) as the browser branch of that switch. The same
applies to `services/local*.ts`, which all `require('electron-store')` in a try/catch and
fall back to memory.

### 2.6 🟠 Barcode scanning has no mobile equivalent

`components/POS/index.tsx:73-228` is a global `keydown` buffer that reconstructs input from
USB HID scanner guns. There is no HID device on a phone. Needs a camera scanner
(`BarcodeDetector` where available — Chrome/Android — with a `zxing-wasm` fallback for iOS
Safari) feeding the same `processBarcodeValue()` lookup.

### 2.7 🟠 Printing is Electron-only

- Receipts: `electronAPI.printReceipt(html, printerName, {...})`
  ([POS/index.tsx:722](../components/POS/index.tsx#L722), [:748](../components/POS/index.tsx#L748))
- Barcode labels: [Inventory/index.tsx:630](../components/Inventory/index.tsx#L630)
- Printer discovery: [hooks/usePrinter.ts:21](../hooks/usePrinter.ts#L21)
- Silent print: [Dashboard/index.tsx:765](../components/Dashboard/index.tsx#L765)

Mobile strategy: Web Share API (send the receipt to the customer over WhatsApp — arguably
better than a thermal slip for this business), jsPDF download (already a dependency), and
`window.print()` for a paired printer. Thermal/label printing stays desktop-only; the
mobile UI should not offer it.

### 2.8 🟠 No PWA infrastructure at all

- No `manifest.webmanifest`, no service worker, no `vite-plugin-pwa`.
- `public/` has only `icon.ico`, `icon.png`, `logo.png` — needs the full maskable icon set
  (192/512 + maskable variants) and splash config.
- `vite.config.ts` sets `base: './'` for `file://` loading in Electron; a hosted PWA wants
  `base: '/'`. Needs a build-mode switch.
- **Tailwind is loaded from a CDN** (`index.html` → `https://cdn.tailwindcss.com`). That is
  a runtime JIT compiler — it cannot be cached usefully, cannot work offline, and is ~100kb
  of blocking script on a mobile connection. Must move to build-time Tailwind before the
  offline story means anything.
- The CSP in `index.html` allows `ws://localhost:*` and `cdn.tailwindcss.com`; it needs a
  production variant scoped to the deploy origin + Supabase.
- `<body class="... overflow-hidden">` and `h-screen w-screen` (`App.tsx:119`) break with the
  mobile URL bar. Use `100dvh` and `viewport-fit=cover` + safe-area insets.

### 2.9 🟡 Auto-update

`components/UpdateNotification.tsx` drives `electron-updater`. On a PWA the service worker
handles updates — needs a parallel "new version available, reload" prompt, and the component
must no-op cleanly when `window.electronAPI` is absent.

### 2.10 🟡 Hosting

There is no deploy target today (Electron loads from disk). Needs a static host —
Cloudflare Pages or Vercel — with HTTPS (mandatory for service workers, camera, and
WebAuthn), and the URL added to Supabase's allowed origins.

---

## 3. Phasing

| Phase | Work | Ships |
|---|---|---|
| **0. Make it safe** | 2.1 auth + RLS, 2.2 Gemini key | Nothing user-visible; unblocks everything |
| **1. Make it cheap** | 2.3 per-slice fetchers, pagination, IndexedDB (2.5) | Desktop gets faster + cheaper too |
| **2. Make it a web app** | 2.8 Tailwind build-time, manifest, SW, icons, dvh/safe-area, 2.10 hosting, 2.4 routing | Installable, works on desktop browser |
| ~~**3. Shell + nav**~~ ✅ | §4a-A: `dvh`, safe areas, banners. Sidebar → drawer. `UpdateNotification` `w-96` | Every view reachable on a phone |
| **4. Small views** | Branches, Customers, Accounting — grids, toolbars, 4 tables, 3 modals | Three views done, pattern established |
| **5. Medium views** | Suppliers (tab row + `min-w` columns), Settings (`w-64` → tab row), SalesHistory (master-detail → push nav) | Owner can watch the business from a phone |
| **6. Large views** | Dashboard (7 modals, 7 tables), Inventory (5 modals, 5 tables, 4 grids) | Full read + stock management |
| **7. POS** | 3-pane → staged flow, exchange panel → full screen, camera scanner (2.6), receipt fallback (2.7), 44px targets | Mobile selling |

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

### B. Multi-pane layouts — the three structural jobs

| Location | Current | Fix |
|---|---|---|
| [POS/index.tsx:1020](../components/POS/index.tsx#L1020) + [:1180](../components/POS/index.tsx#L1180) | `flex h-full`, product grid `flex-1` beside cart `w-96` | Stage the panes: catalog → cart sheet. Cart summary bar when collapsed |
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

Worst offender: the Suppliers expense-history table hardcodes column minimums —
`min-w-36` ([:689](../components/Suppliers.tsx#L689)), `min-w-40` ([:698](../components/Suppliers.tsx#L698)),
`min-w-36` ([:711](../components/Suppliers.tsx#L711)), `min-w-28` ([:723](../components/Suppliers.tsx#L723)),
`min-w-52` ([:732](../components/Suppliers.tsx#L732)) = 192px of forced overflow past a 390px screen.

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
| `SalesHistory.tsx` | — | 3 | — | 3 | master-detail → push nav | **M** |
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
