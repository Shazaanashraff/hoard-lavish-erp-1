# SMS setup (text.lk) — one-time

Everything below is done **once per Supabase project**. After this, admins manage SMS entirely from
**Settings → SMS** in the app; nobody needs to touch the server again unless the token is rotated.

Feature docs: [`docs/map/sms.md`](./map/sms.md) · known issues: [`docs/fixes/sms.md`](./fixes/sms.md)

---

## 0. What you need

| Thing | Where it comes from | Where it ends up |
|-------|---------------------|------------------|
| text.lk **API token** | text.lk dashboard → Developers / API | **Edge Function secret only.** Never in `.env`, never in the app. |
| text.lk **sender ID** | text.lk dashboard — must be an **approved** sender | `app_settings.sms_sender_id`, edited in Settings → SMS |
| Supabase CLI | `npm i -g supabase` (or use `npx supabase`) | your machine |

> **Why the token is not in `.env`:** anything `.env` exposes to the renderer ships inside the
> installer and is readable on every till. `vite.config.ts` spells out the same rule for the Gemini
> key. The token lives only in the `send-sms` Edge Function.

---

## 1. Apply the migration

Run, in order, [`019_sms_campaigns.sql`](../supabase/migrations/019_sms_campaigns.sql) then
[`020_sms_sender_checks.sql`](../supabase/migrations/020_sms_sender_checks.sql) in the Supabase SQL
Editor, or:

```bash
supabase db push
```

019 creates `sms_campaigns` / `sms_messages`, adds `customers.sms_opt_out` and the three
`app_settings.sms_*` columns, and installs the five `fn_*_sms*` RPCs with their grants. 020 adds the
`sms_sender_checks` log and makes `fn_create_sms_campaign` refuse an unverified sender ID.

## 2. Set the API token as a function secret

```bash
supabase secrets set TEXTLK_API_TOKEN=your_text_lk_api_token
```

Optional — only if text.lk ever moves the endpoint:

```bash
supabase secrets set TEXTLK_API_URL=https://app.text.lk/api/v3/sms/send
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically; do not set them yourself.

## 3. Deploy the function

```bash
supabase functions deploy send-sms
```

## 4. Turn it on in the app

**Settings → SMS** (admin only):

1. **Enable SMS sending** — the server refuses every campaign while this is off.
2. **Sender ID** — exactly as approved on text.lk. Max 11 characters for an alphanumeric ID; an
   unapproved ID is rejected by the gateway, and every message in the campaign fails.
3. **Daily message limit** — a spend guard enforced inside `fn_create_sms_campaign`. Set it a little
   above your largest expected send (default 500).

## 5. Verify the sender ID (costs one credit)

**Settings → SMS → Verify sender ID**: type your own mobile number, confirm, and the function sends
one real test SMS from the sender ID. Success records the verification and the badge turns green;
if text.lk rejects the ID, its message is shown verbatim. **Nothing can be sent until this passes**
(including Test runs), and editing the sender ID un-verifies it. Limited to 5 attempts per hour.

## 6. Dry-run the rest without spending credit

Customers → **SMS** → tick **Test run** → Send. This walks the whole path (campaign row, batch
claim, result recording, history entry) but never contacts the gateway, so nothing is delivered and
nothing is charged. Then send one real message to your own number before a real campaign.

---

## Rotating the token

```bash
supabase secrets set TEXTLK_API_TOKEN=new_token
supabase functions deploy send-sms   # redeploy so the new secret is picked up
```

No app update and no client change — the token was never in the client.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "TEXTLK_API_TOKEN is not set on this function" | Step 2 or 3 skipped | Set the secret, then **redeploy** |
| "SMS sending is disabled" | `sms_enabled` false | Settings → SMS → enable |
| "No SMS sender ID configured" | `sms_sender_id` empty | Settings → SMS → sender ID |
| "Sender ID … has not been verified" | No accepted test for this exact ID | Settings → SMS → Verify sender ID (match case exactly) |
| Verify says "Too many verification attempts" | 5 tests in the last hour | Wait; check the ID and token first so retries aren't wasted |
| Verify shows the gateway rejected it | ID not approved on this text.lk account, wrong spelling, or no credit | Compare with the text.lk dashboard letter for letter |
| "Daily SMS limit of N would be exceeded" | Spend guard hit | Raise the limit, or send tomorrow / to fewer customers |
| Every message FAILED, same gateway error | Sender ID not approved, or no credit | Check the text.lk dashboard; the exact gateway message is on each row in History |
| "Failed to send a request to the Edge Function" | Function not deployed | `supabase functions deploy send-sms` |
| Campaign stuck on SENDING | An invocation died mid-batch | Its claims expire after 5 minutes; **Retry failed** in History, or re-open the campaign |
| Customer never receives anything but shows SENT | Gateway accepted it; delivery is the carrier's | `provider_uid` on the row is the text.lk reference to quote in support |

### Checking the function's own logs

```bash
supabase functions logs send-sms
```

Gateway failures are recorded per recipient in the app's History tab — read that first; the function
log is only for problems that stop a whole batch.
