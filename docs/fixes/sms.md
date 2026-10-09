# Findings — SMS (Customer campaigns)

> Companion to `docs/map/sms.md`. One finding per block. Newest issues at the top of their
> severity tier. When a finding is fixed, move it to the "Resolved" section with the commit sha.

Severity and category legend lives in [README.md](./README.md). Quick reminder:
**P0** data-integrity/broken · **P1** EGRESS (primary goal) · **P2** perf/security · **P3** cleanup/tests.

Context: this unit was written *with* these findings in mind, so several are documented trade-offs
rather than oversights — SMS-01 in particular cannot be closed without the per-user auth migration
that migration 017 also defers. Read the design notes at the top of
`supabase/migrations/019_sms_campaigns.sql` before "fixing" anything here.

---

## Open

### SMS-01 · P2 · SECURITY · `supabase/functions/send-sms/index.ts:1` / `supabase/migrations/019_sms_campaigns.sql:142`
- **Problem:** the app has no per-user auth — every request uses the one public anon key (migration
  017's preamble). So anyone holding that key can call `fn_create_sms_campaign` and then invoke
  `send-sms`, i.e. **spend real SMS credit and message the entire customer list**. The Edge Function
  verifies the JWT by default, but the anon key *is* an accepted JWT. Adding a shared secret header
  would not help: it would have to ship in the same client bundle.
  The cashier gate in `Customers.tsx` is UI-only, same as `CUST-03`.
- **Impact:** unlike the other open-RLS risks in this codebase, this one has a direct cash cost and
  is visible to customers (a spam SMS from the store's own sender ID). Blast radius is bounded, by
  design, to `app_settings.sms_daily_limit` messages per day.
- **Fix:** real Supabase Auth sessions with `app_metadata` roles, then gate `fn_create_sms_campaign`
  on an admin/manager role and drop the blanket anon grant. Until then the daily cap and the
  `sms_enabled` switch are the mitigation — **keep both server-side**; do not move either check into
  the client, and do not raise the default cap without a reason.

### SMS-02 · P2 · PERF · `context/StoreContext.tsx` (`runSmsCampaign`)
- **Problem:** the batch loop is sequential — one `send-sms` invocation at a time, 25 recipients each,
  4 gateway calls in parallel inside. A 500-recipient campaign is ~20 round trips and runs for
  minutes with the composer tab open.
- **Impact:** the operator must leave the screen open; navigating away or closing the app mid-campaign
  stops the loop. Nothing is lost (rows stay `QUEUED`, "Retry" / re-send resumes), but the send
  silently stalls until someone notices.
- **Fix:** move the loop server-side — have `send-sms` re-invoke itself for the next batch, or drive it
  from `pg_cron` over any campaign with pending rows. Then the client only polls for progress and
  closing the window is harmless. Worth doing before campaigns routinely exceed a few hundred.

### SMS-03 · P2 · SECURITY · `supabase/migrations/019_sms_campaigns.sql:495`
- **Problem:** `anon` has `DELETE` on `sms_campaigns`, which cascades to `sms_messages`. The UI shows
  the button to admins only — again a UI-only gate.
- **Impact:** the audit trail of who was messaged, with what, and at what cost is deletable by anyone
  with the anon key. For a marketing log that is a compliance-flavoured risk, not just tidiness.
- **Fix:** drop the `anon_delete_sms_campaigns` policy and replace the button with a soft delete
  (`archived_at`), or defer the delete to the role-gated RPC that SMS-01's fix introduces.

### SMS-04 · P3 · BUG · `supabase/functions/send-sms/index.ts` (`sendOne`)
- **Problem:** `SENT` records the gateway's *synchronous acceptance*, not delivery. text.lk returns
  `data.status` (often `"Delivered"`) at accept time and supports inbound/DLR webhooks, which are not
  wired up — so a number that is switched off, barred, or invalid at the carrier shows `SENT` forever.
- **Impact:** the history screen slightly overstates success; a customer who complains they got
  nothing cannot be distinguished from one who did.
- **Fix:** add a `delivery-status` Edge Function endpoint for text.lk's DLR callback and a
  `delivered_at` / `final_status` column, or poll text.lk's "view SMS" endpoint by `provider_uid` for
  recent campaigns. Label the current column "Accepted" in the UI until then.

### SMS-05 · P3 · TEST · `context/StoreContext.tsx` / `supabase/functions/send-sms/index.ts`
- **Progress 2026-10-09:** the gateway-error mapping is now extracted
  (`supabase/functions/send-sms/gateway.ts`) and tested (`tests/sms-gateway.test.ts`), as is
  `SenderIdVerifier`. Still open: the `runSmsCampaign` loop and the RPC guards (now including the
  sender-verification gate and the verify rate limit).
- **Problem:** `utils/sms.ts` is well covered (`utils/sms.test.ts`, 19 cases), but nothing tests the
  moving parts: the `runSmsCampaign` loop (resume after a failed batch, the `maxIterations` cap, the
  `claimed === 0` back-off), or the RPC guards (`sms_enabled`, sender ID, daily cap, opt-out
  re-check, `SKIP LOCKED` under concurrency).
- **Impact:** these are exactly the paths where a regression costs money or double-sends, and the ones
  a reader is most likely to "simplify". A broken `maxIterations` guard is an unbounded billing loop.
- **Fix:** unit-test `runSmsCampaign` against a stubbed `sendSmsBatch` (including a throwing batch and
  a `remaining`-never-decreases server); extract `sendOne`'s response mapping into a pure function and
  test it against recorded text.lk payloads; add a pgTAP or SQL-fixture test for the four RPC guards.

### SMS-06 · P3 · CONSISTENCY · `context/StoreContext.tsx` (`loadSmsCampaigns`)
- **Problem:** unlike customers/products, SMS campaigns have **no local mirror** in `services/local*`
  and no `isCacheFresh` day gate — `loadSmsCampaigns` is a once-per-session fetch of 50 rows, and the
  History tab is simply empty offline.
- **Impact:** minor and arguably correct (a send log is worthless offline, since sending is
  online-only), but it is a deliberate departure from the local-first pattern every other list follows
  — worth recording so the next reader does not "fix" the inconsistency by accident.
- **Fix:** none needed. If campaign history ever has to be readable offline, add
  `services/localSmsCampaigns.ts` following `localCustomers.ts` — do **not** cache `sms_messages`, it
  is unbounded.

### SMS-07 · P3 · SECURITY · `supabase/functions/send-sms/index.ts` (`handleVerifySender`)
- **Problem:** `verify-sender` is callable by anyone holding the anon key (same root cause as SMS-01)
  and sends a real SMS to a caller-chosen number. The only brake is the 5-per-hour cap counted from
  `sms_sender_checks`.
- **Impact:** at worst ~5 credits/hour of spam from the store's sender ID to arbitrary numbers, plus
  the cap can be used to *block* a legitimate admin's verification for the rest of the hour.
- **Fix:** same as SMS-01 — gate the action on a real admin session. Until then, keep the cap low.

### SMS-08 · P3 · BUG · `supabase/migrations/020_sms_sender_checks.sql`
- **Problem:** a sender ID counts as verified from one accepted test forever. If text.lk later revokes
  the ID, the app still shows *Verified* and campaigns start, then fail per row.
- **Impact:** the failure is visible (every row FAILED with the gateway message) and costs nothing,
  but it is the same confusing outcome verification was meant to remove.
- **Fix:** expire the check (e.g. require an `ok` row newer than 90 days), or record a failed row when
  a whole campaign fails with a sender-ID error so the badge flips. Low priority.

---

## Resolved
<!-- - SMS-NN · fixed in <sha> <date> — one line on the fix. -->
