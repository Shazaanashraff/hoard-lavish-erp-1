-- ============================================================
-- SMS sender-ID verification
--
-- text.lk exposes no endpoint that lists approved sender IDs, and an
-- unapproved ID only fails at send time -- so a typo in Settings used to
-- surface as a whole campaign of FAILED rows. The `send-sms` Edge
-- Function now has a `verify-sender` action: it sends ONE real test SMS
-- from the candidate sender ID and records the gateway's answer here.
--
-- DESIGN NOTES:
--
-- 1. The log lives in its own table, NOT as columns on app_settings.
--    app_settings is writable by the anon key (migration 017's open-RLS
--    posture), so a "verified" flag stored there could be forged with a
--    single UPDATE. This table has no anon write path: only service_role
--    (the Edge Function) inserts, which makes "verified" a statement the
--    gateway made, not one a browser made.
--
-- 2. "Verified" is derived, not stored: a sender ID counts as verified
--    when at least one ok = true row exists for exactly that string.
--    Changing the sender ID in Settings therefore un-verifies it
--    automatically -- there is no flag to forget to reset.
--
-- 3. The same rows are the rate limit for the verify action (it counts
--    the last hour's attempts), so every attempt is logged, ok or not.
--    The test phone number is stored masked: this table is readable by
--    anon, and the number is usually an admin's own.
--
-- Run in the Supabase SQL Editor, or `supabase db push`.
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_sender_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  -- e.g. 9477***567 -- never the full number (see note 3).
  phone_masked TEXT NOT NULL DEFAULT '',
  ok BOOLEAN NOT NULL,
  provider_uid TEXT,
  provider_status TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Is this sender ID verified?" and "attempts in the last hour".
CREATE INDEX IF NOT EXISTS idx_sms_sender_checks_sender ON sms_sender_checks (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_sender_checks_created ON sms_sender_checks (created_at DESC);

ALTER TABLE sms_sender_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sms_sender_checks" ON sms_sender_checks;
CREATE POLICY "anon_select_sms_sender_checks" ON sms_sender_checks FOR SELECT TO anon USING (true);

-- No INSERT/UPDATE/DELETE policy exists for anon, so RLS already denies
-- them; the REVOKE makes that independent of the policy list.
REVOKE INSERT, UPDATE, DELETE ON sms_sender_checks FROM anon, authenticated;

-- ============================================================
-- fn_create_sms_campaign -- 019's version plus the verification gate
--
-- Identical to 019 except for the block marked "NEW". The check lives
-- here, not in the UI, for the same reason the enable switch and daily
-- cap do: a stale or hand-rolled client must not be able to skip it.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_create_sms_campaign(
  p_name TEXT,
  p_message TEXT,
  p_audience TEXT,
  p_created_by UUID,
  p_created_by_name TEXT,
  p_branch_id UUID,
  p_branch_name TEXT,
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

  -- NEW: the sender ID must have passed a real send through the gateway.
  IF NOT EXISTS (
    SELECT 1 FROM sms_sender_checks
    WHERE ok AND sender_id = TRIM(v_settings.sms_sender_id)
  ) THEN
    RAISE EXCEPTION 'Sender ID "%" has not been verified with text.lk. Open Settings > SMS and use "Verify sender ID" first.',
      TRIM(v_settings.sms_sender_id);
  END IF;

  IF COALESCE(TRIM(p_message), '') = '' THEN
    RAISE EXCEPTION 'Message body cannot be empty';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' OR jsonb_array_length(p_recipients) = 0 THEN
    RAISE EXCEPTION 'No recipients supplied';
  END IF;

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
      status = CASE WHEN v_queued = 0 THEN 'COMPLETED'::sms_campaign_status ELSE 'QUEUED'::sms_campaign_status END,
      completed_at = CASE WHEN v_queued = 0 THEN now() ELSE NULL END
  WHERE id = v_campaign_id;

  RETURN v_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_create_sms_campaign(TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_create_sms_campaign(TEXT, TEXT, TEXT, UUID, TEXT, UUID, TEXT, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
