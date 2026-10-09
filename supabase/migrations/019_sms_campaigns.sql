-- ============================================================
-- SMS campaigns (text.lk gateway)
--
-- Adds bulk-SMS-to-customers: a campaign row per send, one
-- sms_messages row per recipient, and the RPCs that the client and
-- the `send-sms` Edge Function use to drive the send.
--
-- Run in the Supabase SQL Editor, or `supabase db push`.
--
-- DESIGN NOTES FOR WHOEVER READS THIS LATER:
--
-- 1. The text.lk API token is NEVER in this database and never in
--    the client bundle. It lives as an Edge Function secret
--    (`TEXTLK_API_TOKEN`) and only `supabase/functions/send-sms`
--    ever sees it. The *sender ID* is not a secret and does live in
--    `app_settings.sms_sender_id`, so an admin can change it in the
--    UI without a redeploy.
--
-- 2. Split of duties: the client (anon key) may CREATE a campaign
--    and READ progress, but may not write a single delivery result.
--    Claiming work and recording results are granted to
--    `service_role` only, so the numbers in the history screen come
--    from the gateway via the Edge Function, not from whatever a
--    browser felt like POSTing.
--
-- 3. This app still has no per-user auth (see migration 017) --
--    every request carries the same public anon key. So anyone
--    holding that key can create a campaign, i.e. spend SMS credit.
--    That cannot be closed without real sessions. What it IS
--    bounded by, deliberately, is money:
--      * `app_settings.sms_daily_limit` caps messages queued per
--        calendar day, enforced inside fn_create_sms_campaign
--        (section 4) where a client cannot skip it;
--      * `app_settings.sms_enabled` is a hard off switch;
--      * a UNIQUE(campaign_id, phone) index makes a double-submit
--        collapse instead of double-charging.
--    Tracked as SMS-01 in docs/fixes/sms.md.
--
-- 4. Sends are resumable, not fire-and-forget. A message row moves
--    QUEUED -> SENDING (claimed) -> SENT | FAILED. If the Edge
--    Function dies mid-batch, the claim goes stale after 5 minutes
--    and fn_claim_sms_batch hands the row out again -- so a crash
--    costs a retry, never a lost or silently dropped recipient.
-- ============================================================

-- ============================================================
-- 1. Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE sms_campaign_status AS ENUM ('QUEUED', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sms_message_status AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. Settings + customer opt-out
-- ============================================================
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS sms_sender_id TEXT NOT NULL DEFAULT '';
-- Messages that may be QUEUED per calendar day, across all campaigns.
-- The spend guard described in note 3 above.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS sms_daily_limit INT NOT NULL DEFAULT 500;

-- Customers who asked not to be messaged. The composer filters these out
-- client-side for the preview count, and fn_create_sms_campaign re-checks
-- server-side so a stale client cannot message them anyway.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3. Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  -- The template as typed, placeholders un-substituted. Per-recipient
  -- bodies live on sms_messages.body (see section 4).
  message TEXT NOT NULL,
  sender_id TEXT NOT NULL DEFAULT '',
  status sms_campaign_status NOT NULL DEFAULT 'QUEUED',
  -- 'ALL' | 'SELECTED' -- audit trail for how the list was picked.
  audience TEXT NOT NULL DEFAULT 'SELECTED',
  total_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  -- Sum of the per-message costs the gateway reported. Provider
  -- currency (text.lk credits), NOT the store currency.
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  branch_name TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  -- SET NULL, plus a denormalized name/phone snapshot, so the send log
  -- survives a customer delete (same posture as sales.customer_id).
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  -- Normalized msisdn actually handed to the gateway (e.g. 94771234567).
  phone TEXT NOT NULL,
  -- Exactly what was stored on the customer, for "why did this fail".
  raw_phone TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status sms_message_status NOT NULL DEFAULT 'QUEUED',
  provider_uid TEXT,
  provider_status TEXT,
  cost NUMERIC(12,2),
  sms_count INT,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The batch claimer's access path.
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_status ON sms_messages (campaign_id, status);
-- History screen ordering.
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_created_at ON sms_campaigns (created_at DESC);
-- One message per number per campaign: a double-tapped Send collapses
-- instead of charging twice (design note 3).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_messages_campaign_phone ON sms_messages (campaign_id, phone);

-- ============================================================
-- 4. fn_create_sms_campaign -- the only way a client creates work
--
-- Takes the fully rendered recipient list (the client renders the
-- {name}/{points} placeholders so the operator's preview and the
-- delivered text are byte-identical) and returns the campaign id.
--
-- Enforces, server-side and un-skippable: the sms_enabled switch, a
-- non-empty sender id, a non-empty body, the daily cap, and opt-out.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_create_sms_campaign(
  p_name TEXT,
  p_message TEXT,
  p_audience TEXT,
  p_created_by UUID,
  p_created_by_name TEXT,
  p_branch_id UUID,
  p_branch_name TEXT,
  -- [{ customer_id, customer_name, phone, raw_phone, body,
  --    status: 'QUEUED'|'SKIPPED', error_message }]
  p_recipients JSONB
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings RECORD;
  v_campaign_id UUID;
  v_queued INT;
  v_skipped INT;
  v_today_count INT;
  v_incoming INT;
BEGIN
  SELECT sms_enabled, sms_sender_id, sms_daily_limit
  INTO v_settings
  FROM app_settings
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'App settings row is missing - cannot send SMS';
  END IF;

  IF NOT v_settings.sms_enabled THEN
    RAISE EXCEPTION 'SMS sending is disabled. Enable it in Settings > SMS first.';
  END IF;

  IF COALESCE(TRIM(v_settings.sms_sender_id), '') = '' THEN
    RAISE EXCEPTION 'No SMS sender ID configured. Set it in Settings > SMS first.';
  END IF;

  IF COALESCE(TRIM(p_message), '') = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' OR jsonb_array_length(p_recipients) = 0 THEN
    RAISE EXCEPTION 'No recipients supplied';
  END IF;

  -- Daily spend cap. Counts everything already committed to the gateway
  -- today (QUEUED work included -- it will be charged shortly).
  SELECT COUNT(*) INTO v_today_count
  FROM sms_messages
  WHERE created_at >= date_trunc('day', now())
    AND status IN ('QUEUED', 'SENDING', 'SENT');

  SELECT COUNT(*) INTO v_incoming
  FROM jsonb_array_elements(p_recipients) r
  WHERE COALESCE(r->>'status', 'QUEUED') = 'QUEUED';

  IF v_today_count + v_incoming > v_settings.sms_daily_limit THEN
    RAISE EXCEPTION 'Daily SMS limit of % would be exceeded (% already queued/sent today, % more requested). Raise the limit in Settings > SMS or send to fewer customers.',
      v_settings.sms_daily_limit, v_today_count, v_incoming;
  END IF;

  INSERT INTO sms_campaigns (
    name, message, sender_id, status, audience,
    created_by, created_by_name, branch_id, branch_name
  ) VALUES (
    COALESCE(NULLIF(TRIM(p_name), ''), 'Campaign ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    p_message,
    TRIM(v_settings.sms_sender_id),
    'QUEUED',
    COALESCE(NULLIF(p_audience, ''), 'SELECTED'),
    p_created_by, COALESCE(p_created_by_name, ''), p_branch_id, COALESCE(p_branch_name, '')
  ) RETURNING id INTO v_campaign_id;

  INSERT INTO sms_messages (
    campaign_id, customer_id, customer_name, phone, raw_phone, body, status, error_message
  )
  SELECT
    v_campaign_id,
    NULLIF(r->>'customer_id', '')::UUID,
    COALESCE(r->>'customer_name', ''),
    TRIM(r->>'phone'),
    COALESCE(r->>'raw_phone', ''),
    COALESCE(NULLIF(r->>'body', ''), p_message),
    -- Server-side opt-out re-check: a client working from a stale
    -- customer cache cannot message someone who has since opted out.
    CASE
      WHEN COALESCE(r->>'status', 'QUEUED') = 'SKIPPED' THEN 'SKIPPED'
      WHEN EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = NULLIF(r->>'customer_id', '')::UUID AND c.sms_opt_out
      ) THEN 'SKIPPED'
      ELSE 'QUEUED'
    END::sms_message_status,
    CASE
      WHEN COALESCE(r->>'status', 'QUEUED') = 'SKIPPED' THEN NULLIF(r->>'error_message', '')
      WHEN EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = NULLIF(r->>'customer_id', '')::UUID AND c.sms_opt_out
      ) THEN 'Customer opted out of SMS'
      ELSE NULL
    END
  FROM jsonb_array_elements(p_recipients) r
  WHERE COALESCE(TRIM(r->>'phone'), '') <> ''
  ON CONFLICT (campaign_id, phone) DO NOTHING;

  SELECT
    COUNT(*) FILTER (WHERE status = 'QUEUED'),
    COUNT(*) FILTER (WHERE status = 'SKIPPED')
  INTO v_queued, v_skipped
  FROM sms_messages
  WHERE campaign_id = v_campaign_id;

  UPDATE sms_campaigns
  SET total_count = v_queued,
      skipped_count = v_skipped,
      -- Nothing sendable (everything invalid or opted out): finish it here
      -- rather than leaving a campaign the sender loop can never drain.
      status = CASE WHEN v_queued = 0 THEN 'COMPLETED'::sms_campaign_status ELSE 'QUEUED'::sms_campaign_status END,
      completed_at = CASE WHEN v_queued = 0 THEN now() ELSE NULL END
  WHERE id = v_campaign_id;

  RETURN v_campaign_id;
END;
$$;

-- ============================================================
-- 5. fn_claim_sms_batch -- service_role only
--
-- Atomically hands out up to p_limit sendable rows. SKIP LOCKED so
-- two concurrent Edge Function invocations never claim the same row;
-- stale claims (a crashed invocation) are recycled first.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_claim_sms_batch(p_campaign_id UUID, p_limit INT DEFAULT 25)
RETURNS TABLE(id UUID, phone TEXT, body TEXT, attempts INT)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_status sms_campaign_status;
BEGIN
  SELECT c.status INTO v_status FROM sms_campaigns c WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign % not found', p_campaign_id;
  END IF;

  -- A cancelled campaign hands out nothing, even mid-flight.
  IF v_status = 'CANCELLED' THEN
    RETURN;
  END IF;

  -- Recycle claims from an invocation that died before reporting.
  UPDATE sms_messages m
  SET status = 'QUEUED', claimed_at = NULL
  WHERE m.campaign_id = p_campaign_id
    AND m.status = 'SENDING'
    AND m.claimed_at < now() - INTERVAL '5 minutes';

  UPDATE sms_campaigns c
  SET status = 'SENDING'
  WHERE c.id = p_campaign_id AND c.status = 'QUEUED';

  RETURN QUERY
  WITH claimed AS (
    SELECT m.id
    FROM sms_messages m
    WHERE m.campaign_id = p_campaign_id
      AND m.status = 'QUEUED'
    ORDER BY m.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE sms_messages m
  SET status = 'SENDING',
      claimed_at = now(),
      attempts = m.attempts + 1
  FROM claimed
  WHERE m.id = claimed.id
  RETURNING m.id, m.phone, m.body, m.attempts;
END;
$$;

-- ============================================================
-- 6. fn_record_sms_results -- service_role only
--
-- Writes the gateway's answer for a claimed batch, then recomputes
-- the campaign's counters and terminal status from the rows (never
-- from a number the caller passed in).
-- ============================================================
CREATE OR REPLACE FUNCTION fn_record_sms_results(p_campaign_id UUID, p_results JSONB)
RETURNS TABLE(
  campaign_status sms_campaign_status,
  total_count INT,
  sent_count INT,
  failed_count INT,
  skipped_count INT,
  pending_count INT,
  total_cost NUMERIC
)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_sent INT;
  v_failed INT;
  v_skipped INT;
  v_pending INT;
  v_total INT;
  v_cost NUMERIC;
  v_status sms_campaign_status;
  v_cancelled BOOLEAN;
BEGIN
  IF p_results IS NOT NULL AND jsonb_typeof(p_results) = 'array' THEN
    UPDATE sms_messages m
    SET status = CASE WHEN (r->>'status') = 'SENT' THEN 'SENT' ELSE 'FAILED' END::sms_message_status,
        provider_uid = NULLIF(r->>'provider_uid', ''),
        provider_status = NULLIF(r->>'provider_status', ''),
        cost = NULLIF(r->>'cost', '')::NUMERIC,
        sms_count = NULLIF(r->>'sms_count', '')::INT,
        error_message = NULLIF(r->>'error_message', ''),
        sent_at = CASE WHEN (r->>'status') = 'SENT' THEN now() ELSE NULL END,
        claimed_at = NULL
    FROM jsonb_array_elements(p_results) r
    WHERE m.id = (r->>'id')::UUID
      AND m.campaign_id = p_campaign_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE m.status = 'SENT'),
    COUNT(*) FILTER (WHERE m.status = 'FAILED'),
    COUNT(*) FILTER (WHERE m.status = 'SKIPPED'),
    COUNT(*) FILTER (WHERE m.status IN ('QUEUED', 'SENDING')),
    COUNT(*) FILTER (WHERE m.status <> 'SKIPPED'),
    COALESCE(SUM(m.cost), 0)
  INTO v_sent, v_failed, v_skipped, v_pending, v_total, v_cost
  FROM sms_messages m
  WHERE m.campaign_id = p_campaign_id;

  SELECT c.status = 'CANCELLED' INTO v_cancelled FROM sms_campaigns c WHERE c.id = p_campaign_id;

  v_status := CASE
    WHEN v_cancelled THEN 'CANCELLED'::sms_campaign_status
    WHEN v_pending > 0 THEN 'SENDING'::sms_campaign_status
    WHEN v_failed = 0 THEN 'COMPLETED'::sms_campaign_status
    WHEN v_sent = 0 THEN 'FAILED'::sms_campaign_status
    ELSE 'PARTIAL'::sms_campaign_status
  END;

  UPDATE sms_campaigns c
  SET status = v_status,
      total_count = v_total,
      sent_count = v_sent,
      failed_count = v_failed,
      skipped_count = v_skipped,
      total_cost = v_cost,
      completed_at = CASE WHEN v_pending = 0 THEN COALESCE(c.completed_at, now()) ELSE NULL END
  WHERE c.id = p_campaign_id;

  RETURN QUERY SELECT v_status, v_total, v_sent, v_failed, v_skipped, v_pending, v_cost;
END;
$$;

-- ============================================================
-- 7. fn_cancel_sms_campaign / fn_requeue_failed_sms -- client RPCs
-- ============================================================

-- Stops a running campaign: everything not yet handed to the gateway
-- becomes SKIPPED. Rows already SENDING are left alone -- they may
-- already have been charged, so they are reported, not rewritten.
CREATE OR REPLACE FUNCTION fn_cancel_sms_campaign(p_campaign_id UUID)
RETURNS INT
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_cancelled INT;
BEGIN
  WITH updated AS (
    UPDATE sms_messages m
    SET status = 'SKIPPED',
        error_message = 'Campaign cancelled',
        claimed_at = NULL
    WHERE m.campaign_id = p_campaign_id
      AND m.status = 'QUEUED'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_cancelled FROM updated;

  UPDATE sms_campaigns c
  SET status = 'CANCELLED',
      skipped_count = (SELECT COUNT(*) FROM sms_messages m WHERE m.campaign_id = p_campaign_id AND m.status = 'SKIPPED'),
      completed_at = COALESCE(c.completed_at, now())
  WHERE c.id = p_campaign_id;

  RETURN v_cancelled;
END;
$$;

-- Puts the FAILED rows of a finished campaign back in the queue so the
-- client can run the sender loop again. Returns how many were requeued.
CREATE OR REPLACE FUNCTION fn_requeue_failed_sms(p_campaign_id UUID)
RETURNS INT
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_requeued INT;
BEGIN
  WITH updated AS (
    UPDATE sms_messages m
    SET status = 'QUEUED',
        error_message = NULL,
        claimed_at = NULL
    WHERE m.campaign_id = p_campaign_id
      AND m.status = 'FAILED'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_requeued FROM updated;

  IF v_requeued > 0 THEN
    UPDATE sms_campaigns c
    SET status = 'QUEUED',
        failed_count = 0,
        completed_at = NULL
    WHERE c.id = p_campaign_id;
  END IF;

  RETURN v_requeued;
END;
$$;

-- ============================================================
-- 8. RLS
--
-- Clients read both tables (history screen + live progress) and write
-- neither: every state change goes through the RPCs above. DELETE on
-- campaigns stays so an admin can clear old history; sms_messages
-- cascades with it.
-- ============================================================
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sms_campaigns" ON sms_campaigns;
CREATE POLICY "anon_select_sms_campaigns" ON sms_campaigns FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon_delete_sms_campaigns" ON sms_campaigns;
CREATE POLICY "anon_delete_sms_campaigns" ON sms_campaigns FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "anon_select_sms_messages" ON sms_messages;
CREATE POLICY "anon_select_sms_messages" ON sms_messages FOR SELECT TO anon USING (true);

-- ============================================================
-- 9. Grants
--
-- The asymmetry here is the point (design note 2): anon can start and
-- stop work, only service_role can claim it or record what the
-- gateway said.
-- ============================================================
REVOKE ALL ON FUNCTION fn_create_sms_campaign(TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_create_sms_campaign(TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, JSONB) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_cancel_sms_campaign(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_cancel_sms_campaign(UUID) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_requeue_failed_sms(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_requeue_failed_sms(UUID) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_claim_sms_batch(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_claim_sms_batch(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION fn_record_sms_results(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_record_sms_results(UUID, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
