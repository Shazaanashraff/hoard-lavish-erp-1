# SMS (Customer campaigns)

> One-line: sends a text message through text.lk to selected customers or the whole customer list,
> and keeps a per-recipient log of what the gateway did with each one.
>
> Status: **DRAFT** · Last verified against code: 2026-09-28 · Commit: introduced with
> `supabase/migrations/019_sms_campaigns.sql`

Read this file (and `docs/fixes/sms.md`) before editing the SMS feature. If the code and this doc
disagree, **the code wins** — fix the doc in the same change. One-time server setup (token, deploy,
sender ID) is a separate document: [`docs/sms-setup.md`](../sms-setup.md).

---

## Key files

| File | Role |
|------|------|
| [components/Customers.tsx](../../components/Customers.tsx) | UI entry point — row checkboxes, the **SMS** button, and the `SMS` view with its Compose / History tabs. |
| [components/sms/SmsComposer.tsx](../../components/sms/SmsComposer.tsx) | Compose screen: audience, template, live segment/cost counts, skip reasons, confirm + progress. |
| [components/sms/SmsCampaignHistory.tsx](../../components/sms/SmsCampaignHistory.tsx) | History screen: campaign rows, expandable per-recipient log, stop / retry / delete. |
| [utils/sms.ts](../../utils/sms.ts) | Pure logic: phone normalization, GSM-7/UCS-2 segment counting, placeholder rendering, `buildRecipients`. |
| [context/StoreContext.tsx](../../context/StoreContext.tsx) | Actions: `sendSmsCampaign`, the `runSmsCampaign` batch loop, `retrySmsCampaign`, `cancelSmsCampaign`, `loadSmsCampaigns`. |
| [services/db/sms.ts](../../services/db/sms.ts) | DB layer: campaign/message reads, the RPC wrappers, and `sendSmsBatch` (Edge Function invoke). |
| [supabase/functions/send-sms/index.ts](../../supabase/functions/send-sms/index.ts) | **Backend that does the work.** Holds the text.lk token; claims a batch, calls the gateway, records results. |
| [supabase/migrations/019_sms_campaigns.sql](../../supabase/migrations/019_sms_campaigns.sql) | Tables, enums, the five `fn_*_sms*` RPCs, RLS and the anon/service_role grant split. |
| [components/Settings.tsx](../../components/Settings.tsx) | Settings → **SMS** tab: enable switch, sender ID, daily limit. |
| [components/sms/SenderIdVerifier.tsx](../../components/sms/SenderIdVerifier.tsx) | Settings → SMS: status badge + "Verify sender ID" (sends one real test SMS). |
| [supabase/functions/send-sms/gateway.ts](../../supabase/functions/send-sms/gateway.ts) | Pure text.lk helpers: reply → outcome mapping, the POST, sender-ID format rule. Shared with Vitest. |
| [supabase/migrations/020_sms_sender_checks.sql](../../supabase/migrations/020_sms_sender_checks.sql) | `sms_sender_checks` log + the verification gate inside `fn_create_sms_campaign`. |

## How it works

**Picking the audience** (`Customers.tsx`): each list row carries a checkbox (hidden for cashiers);
`selectedIds` holds the ticks. **Select all** operates on the *filtered* rows, so searching then
selecting means "all matches". The **SMS** button opens `activeView === 'SMS'`, which renders
`SmsComposer` with `customers` (all loaded) plus `selectedIds`. The composer's audience toggle picks
between `SELECTED` (the ticks) and `ALL` (every loaded customer).

**Composing** (`SmsComposer`): the template is rendered per recipient by
`buildRecipients(audienceCustomers, message, {storeName, currencySymbol})` — the **same function the
send path calls**, so the "will send / skipped / SMS units" figures on screen are the ones that get
billed. It returns `queued` (sendable, deduplicated by normalized number), `skipped` (each with a
reason string), and total `segments`. The per-message segment counter is computed from the *longest*
rendered body, not the raw template, because `{name}` makes every recipient's body a different length.

**Verifying the sender ID** (`SenderIdVerifier`, Settings → SMS): text.lk has no endpoint that lists
approved sender IDs, and an unapproved one only fails at send time, so the app tests it with a real
send. The admin types a mobile number and confirms (it costs one credit); `verifySmsSender` →
`send-sms` with `{action:'verify-sender', senderId, phone}` sends one message and inserts the gateway's
verdict into `sms_sender_checks`. The badge is a lookup of "is there an `ok` row for exactly this
string", so it is live as the admin types and falls back to *Not verified* the moment the ID is edited.

**Starting a send** (`sendSmsCampaign`, StoreContext): refuses when Supabase is unconfigured, when
`navigator.onLine === false`, or when a send is already in flight (`smsSendingRef`). Then
`db.createSmsCampaign` calls **`fn_create_sms_campaign`**, which inserts the campaign and one
`sms_messages` row per recipient in one transaction, and re-validates server-side: `sms_enabled`,
a non-empty sender ID, **that the sender ID has a successful verification**, a non-empty body, the
daily cap, and each customer's `sms_opt_out`.

**The send loop** (`runSmsCampaign`, StoreContext): calls `db.sendSmsBatch(campaignId)` repeatedly
until the function reports `remaining === 0`, publishing `smsProgress` after each batch. Each
invocation of the Edge Function:

1. `fn_claim_sms_batch` — recycles claims older than 5 minutes, flips the campaign to `SENDING`, then
   claims up to 25 `QUEUED` rows `FOR UPDATE SKIP LOCKED` (status → `SENDING`, `attempts + 1`).
2. `POST https://app.text.lk/api/v3/sms/send` per row, 4 at a time, 20s timeout each, with
   `{recipient, sender_id, type: 'plain', message}` and the token as a Bearer header.
3. `fn_record_sms_results` — writes each row's `SENT`/`FAILED` + `provider_uid`/`cost`/error, then
   **recomputes** the campaign's counters and terminal status from the rows themselves.

**The loop lives on the client, the sending on the server.** Neither half is arbitrary: a few hundred
recipients exceed the Edge Function's wall clock, so the work has to be chunked; and the token cannot
be on the client, so the chunk has to be sent server-side.

**History** (`SmsCampaignHistory`): `loadSmsCampaigns` fetches the 50 newest campaign rows only; the
per-recipient log is fetched by `loadSmsMessages(campaignId)` when a row is expanded, and cached per
campaign id. **Retry failed** calls `fn_requeue_failed_sms` (FAILED → QUEUED) and re-runs the loop over
just those. **Stop sending** calls `fn_cancel_sms_campaign` (QUEUED → SKIPPED).

## Business rules

- **Who can do what:** the SMS button, the row checkboxes and the whole `SMS` view are hidden when
  `isCashier`; `activeView === 'SMS'` also renders nothing for a cashier. Delete-from-history is
  admin-only. As everywhere else in this app these are **UI-only** gates — see SMS-01.
- **Nothing sends unless an admin turned it on:** `sms_enabled` false → `fn_create_sms_campaign`
  raises. Empty `sms_sender_id` → raises. Both are re-checked server-side, so a stale or hand-rolled
  client cannot bypass them.
- **Sender ID must be verified:** `fn_create_sms_campaign` raises unless `sms_sender_checks` holds an
  `ok = true` row for exactly `TRIM(sms_sender_id)` (case-sensitive). The composer shows a banner and
  disables Send while unverified. This also blocks **Test run**, because the check sits before any
  campaign is created.
- **Verify attempts are rate-limited:** at most 5 per hour across all callers (counted from
  `sms_sender_checks`, ok or not) — each one texts a real phone and spends a credit.
- **Sender ID format:** a phone number with country code (9–15 digits) or letters/digits only, max 11
  characters. Enforced by `validateSenderId` (client) and `senderIdFormatError` (Edge Function); one
  test table runs both so they cannot drift. Format only — *approval* is the gateway's call.
- **Daily spend cap:** `fn_create_sms_campaign` refuses a campaign that would push the count of
  messages created today (`QUEUED` + `SENDING` + `SENT`) past `app_settings.sms_daily_limit`
  (default 500).
- **Opt-out is honoured twice:** `buildRecipients` excludes `customer.smsOptOut` client-side (so the
  operator sees the count), and the RPC re-checks the live `customers.sms_opt_out` on insert.
- **Only Sri Lankan mobiles, or explicit international:** `normalizePhone` accepts `07x…`, `7x…`,
  `94…`, `+94…` (prefixes 70–78) and rejects landlines. A foreign number is accepted **only** when
  written with a leading `+`/`00`, because there is no dial plan to guess a country code against.
- **One message per number per campaign:** deduplicated in `buildRecipients` and enforced by
  `UNIQUE(campaign_id, phone)`, so a double-tapped Send cannot double-charge.
- **Not offline-queueable.** Every other write in StoreContext can be replayed from the offline queue;
  an SMS cannot — replaying "sale ends today" tomorrow is wrong *and* billable. `sendSmsCampaign`
  returns an error while offline instead of enqueuing. There is deliberately no `SEND_SMS`
  `OfflineOperationType`.
- **Status lifecycle:** message `QUEUED → SENDING → SENT | FAILED`, or `→ SKIPPED` (invalid number,
  opt-out, duplicate, cancelled). Campaign `QUEUED → SENDING →` `COMPLETED` (no failures) /
  `PARTIAL` (some sent, some failed) / `FAILED` (none sent) / `CANCELLED`. Every campaign transition
  is computed inside `fn_record_sms_results` from the message rows — never sent by a client.

## Actions & Tools

| Action / call | What it does | Backend touched |
|---------------|--------------|-----------------|
| `loadSmsCampaigns` / `refreshSmsCampaigns` | 50 newest campaign rows (load is once-per-session) | `select` on `sms_campaigns` |
| `loadSmsMessages(id)` | Per-recipient log for one expanded campaign | `select` on `sms_messages` |
| `sendSmsCampaign(input)` | Builds recipients, creates the campaign, drives the loop | `fn_create_sms_campaign` → `send-sms` |
| `runSmsCampaign` (internal) | Batch loop + `smsProgress`, capped by `maxIterations` | `send-sms` (N invocations) |
| `retrySmsCampaign(id)` | Requeues FAILED rows, re-runs the loop over them | `fn_requeue_failed_sms` → `send-sms` |
| `cancelSmsCampaign(id)` | QUEUED → SKIPPED, campaign → CANCELLED | `fn_cancel_sms_campaign` |
| `deleteSmsCampaign(id)` | Optimistic remove, hard delete (messages cascade) | `delete` on `sms_campaigns` |
| `updateSettings({smsEnabled, smsSenderId, smsDailyLimit})` | Settings → SMS tab | `app_settings` |
| `getSmsSenderVerification(id)` | Latest accepted test for exactly this ID, or `null` | `select` on `sms_sender_checks` |
| `verifySmsSender(id, phone)` | Format + phone check, then one real test SMS; online-only | `send-sms` (`verify-sender`) → text.lk, `sms_sender_checks` |
| `updateCustomer(id, {smsOptOut})` | The "Do not send SMS" box in the customer modal | `customers.sms_opt_out` |
| `send-sms` (Edge Function) | Claims, sends, records. **Sole holder of the API token.** | `fn_claim_sms_batch`, text.lk, `fn_record_sms_results` |

## Gotchas (surprising-but-intentional)

- **The client drives the loop, and that is not a leftover.** See "How it works" — chunking is forced
  by the function's wall clock, server-side sending by the secret. A crashed loop is safe: rows stay
  `SENDING` for 5 minutes, then become claimable again, so the worst case is a retry.
- **`totalCost` is text.lk credits, not store currency.** It is deliberately *not* passed through
  `fmtCurrency`; the history screen labels it "units".
- **`totalCount` excludes skipped recipients.** It is the sendable count, so the progress bar's
  denominator matches what is actually being attempted.
- **One Sinhala character or emoji triples the bill.** GSM-7 gives 160 characters per segment, UCS-2
  only 70. The composer flags the encoding switch for exactly this reason.
- **Unknown `{placeholders}` are left in the text, not stripped.** A typo should be visible in the
  preview rather than silently deleted from a message already on its way.
- **A `SENT` row means the gateway accepted it, not that a phone rang.** text.lk's synchronous reply
  is an acceptance; there is no delivery-receipt webhook wired up (SMS-04). `provider_uid` is the
  reference to quote at text.lk support.
- **A campaign with zero sendable recipients is created as `COMPLETED`, not `QUEUED`.** Otherwise the
  loop would have nothing to drain and the row would sit on `QUEUED` forever.
- **Test run writes a full campaign to history.** It is a rehearsal of the whole path, not a preview,
  so it appears in History like any other campaign — with `provider_status: 'DryRun'` on each row.

## Tests

| Path | Covered? | Test file |
|------|----------|-----------|
| `normalizePhone` — all LK forms, prefixes, landlines, junk, international | ☑ | [utils/sms.test.ts](../../utils/sms.test.ts) |
| `smsSegmentInfo` — GSM-7/UCS-2 boundaries, extension chars, emoji, empty | ☑ | same |
| `renderSmsBody` — all placeholders, repeats, unknown token, one-word name | ☑ | same |
| `buildRecipients` — queueing, opt-out/invalid/duplicate skips, segment totals | ☑ | same |
| Gateway reply mapping + POST (success, 200-with-error, non-JSON, timeout, network) | ☑ | [tests/sms-gateway.test.ts](../../tests/sms-gateway.test.ts) |
| Sender-ID format, server copy vs client copy | ☑ | same |
| `SenderIdVerifier` (badge states, confirm-before-send, success, rejection, edit un-verifies) | ☑ | [tests/sender-id-verifier.test.tsx](../../tests/sender-id-verifier.test.tsx) |
| `verify-sender` handler (rate limit, logging) / verification gate in `fn_create_sms_campaign` | ☐ | — (SMS-05; needs live Deno / Postgres) |
| `runSmsCampaign` batch loop (resume, `maxIterations` cap, progress) | ☐ | — (SMS-05) |
| `fn_create_sms_campaign` guards (enable/sender/cap/opt-out) | ☐ | — (SMS-05) |
| `fn_claim_sms_batch` stale-claim recycling + `SKIP LOCKED` | ☐ | — (SMS-05) |

---

<!-- changelog: append one line per code change that touched this unit -->
- 2026-09-28 — initial documentation, written with the feature (migration 019, `send-sms` function,
  composer + history UI).
- 2026-10-09 — sender-ID verification: migration 020 (`sms_sender_checks` + gate in
  `fn_create_sms_campaign`), `verify-sender` action and `gateway.ts` in `send-sms`,
  `SenderIdVerifier` in Settings, verification banner in the composer.
