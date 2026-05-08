# Central Fetching Change Check Guide

## Purpose
Use this guide after a central fetch has replaced one or more local fetches. The goal is to confirm the new shared fetch path returns the same data and does not change the production experience.

## Preconditions
- Work in a separate branch created from `main`.
- Do not apply the change directly on the production branch.
- Confirm the affected target and the page or workflow that consumes it before you start checking.
- If the change lives under `services/db`, verify the downstream page or workflow through its consumer component or context, not the service module in isolation.

## Choose a verification mode
Pick one of the two checks below and record which one you used.

- Manual browser check: use this when you need a quick, human-visible review.
- Playwright check: use this when you want a repeatable smoke test and can target a stable route or component state.
- If you are unsure whether to implement Playwright for the workflow, start with the manual check and add Playwright only when the page or route is stable enough to automate.

## Manual check matrix
Use this table to decide which pages or workflows must be opened when a central CRUD changes. The rule is simple: if one centralized fetch now serves many previous callsites, verify every visible consumer that depends on that data shape or cache key.

| Central CRUD target | Manual-check pages or workflows | What to confirm |
|---|---|---|
| app_settings | Settings page, Dashboard page, POS page | Settings values still load once, currency/tax labels stay correct, and the save flow still updates the same shared state. |
| exchanges | POS page, Dashboard page, SalesHistory page | New exchange rows still appear in all three consumers and the same exchange totals/details remain visible after refresh. |
| localStorage | Offline queue / reload workflow, any page that rehydrates persisted state | Saved state survives reload, queued actions replay correctly, and no record disappears after refresh. |
| product_branch_stock | Inventory page, POS page, Dashboard page, Suppliers page | Branch stock counts match before and after refresh, stock-driven warnings stay accurate, and no branch loses its stock snapshot. |
| sale_items | POS page, SalesHistory page, Dashboard page | Sale line items still appear in checkout/history/reporting views and no line-level detail is dropped. |
| sales | POS page, Dashboard page, SalesHistory page | Sale headers and totals still match the old flow across checkout, reporting, and history. |
| stock_movements | Inventory page, Dashboard page | Movement history still shows every expected row and the newest-first ordering stays intact. |
| stock_transfers | Inventory page | Transfer lists still show all records and transfer details remain available after refresh. |
| supplier_transactions | Suppliers page, Accounting page | Supplier ledger rows still appear in both workflows and accounting-linked fields remain intact. |

If a central CRUD feeds another page later, add that page to the matrix before merging the change.

If you are unsure, start with the manual check. Use Playwright when the page is stable and the central fetch change is likely to be reused later.

## Manual check checklist
1. Open the page that consumes the changed fetch.
2. Compare the visible data against the previous behavior.
3. Confirm the expected records still appear.
4. Confirm counts, labels, filters, dropdowns, and empty states still make sense.
5. Refresh the page and make sure the data still loads normally.
6. Repeat any branch-scoped views if the change touches branch-specific data.
7. If the fetch was centralized from `services/db`, check the same workflow after a hard refresh or route revisit to confirm the consumer still receives the same data.

### Example: locations or branches fetch
If the change replaced several local location fetches with one central fetch, open the page that shows locations or branches and check all of the following:
- Every active location or branch is listed.
- Any dropdown or selector fed by that data includes the same options.
- Search and filtering still work.
- Totals or counts match the expected records.
- No item disappeared because the central query dropped a filter, sort, or branch scope.

## Optional Playwright check
Use Playwright when you want an executable smoke check for the same scenario.

Suggested pattern:
1. Open the affected page.
2. Wait for the centralized data to finish loading.
3. Assert that the expected row, card, list item, or dropdown option appears.
4. Assert that the total number of visible records matches the expected set.
5. Repeat the check after a reload.

Example assertions to adapt:
- The locations list shows all expected locations.
- The branch selector contains the same branch names as before.
- The inventory or customer view still shows the expected records after the central fetch path is enabled.

## What to record
Document the following in the PR or handoff note:
- Branch name used for the change.
- Verification mode used: manual or Playwright.
- Page or workflow checked.
- What data set was validated.
- Any mismatches found and whether they were fixed.
- Whether a Playwright check should be implemented for this workflow going forward.

## Pass criteria
The change is ready when the centralized fetch returns the same visible data as the old flow for the checked page or workflow and no branch-specific records are lost.
