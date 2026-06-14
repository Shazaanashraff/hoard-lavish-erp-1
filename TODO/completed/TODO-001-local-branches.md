# TODO-001: Move branches to local storage and drop them from the fetch-all

- **ID:** 001
- **Priority:** P1
- **Status:** COMPLETED
- **Completed:** 2026-06-10

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

## Implementation

Implemented on branch `TODO/001-local-branches`. PR opened into main.
