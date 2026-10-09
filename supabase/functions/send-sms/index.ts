// ============================================================
// send-sms — the ONLY place the text.lk API token exists.
//
// Deno / Supabase Edge Function. Deploy + secrets:
//   supabase secrets set TEXTLK_API_TOKEN=...
//   supabase functions deploy send-sms
// Full setup walkthrough: docs/sms-setup.md
//
// Why this exists at all: vite.config.ts spells out the rule —
// secrets never go through `define` into the client bundle. The
// renderer knows the sender ID (not a secret) and nothing else.
//
// Contract with the client (services/db/sms.ts):
//   POST { campaignId: string, batchSize?: number, dryRun?: boolean }
//   ->   { claimed, sent, failed, remaining, campaignStatus, ... }
//   POST { action: 'verify-sender', senderId: string, phone: string }
//   ->   { ok, senderId, verifiedAt?, providerUid?, providerStatus?, message? }
// verify-sender sends ONE real SMS from the sender ID to `phone` (it costs
// a credit) and records the outcome in sms_sender_checks. That table is
// what fn_create_sms_campaign consults, so a campaign cannot start from an
// ID the gateway never accepted. text.lk has no endpoint that lists
// approved sender IDs, so an actual send is the only reliable test.
// The client calls this repeatedly until `remaining === 0`. One call
// = one batch, deliberately: a 500-recipient send would blow the
// function's wall-clock limit in a single invocation, and a timeout
// mid-send is the one failure mode that must not lose recipients.
// Each batch is claimed atomically in Postgres, so a dropped
// invocation just leaves the rows to be re-claimed (5-minute stale
// window in fn_claim_sms_batch) rather than half-sent and unrecorded.
// ============================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { postToGateway, senderIdFormatError } from './gateway.ts';

const TEXTLK_URL = Deno.env.get('TEXTLK_API_URL') ?? 'https://app.text.lk/api/v3/sms/send';
const TEXTLK_TOKEN = Deno.env.get('TEXTLK_API_TOKEN') ?? '';

// How many recipients one invocation handles. 25 x ~1s per gateway
// call, 4 at a time, lands well inside the Edge runtime's wall clock
// with room for a slow gateway.
const DEFAULT_BATCH_SIZE = 25;
// Parallel requests to text.lk. Their docs publish no rate limit, so
// this stays low on purpose — being throttled would surface as a pile
// of FAILED rows the operator has to re-send.
const CONCURRENCY = 4;
// Per-request ceiling, so one hung gateway call cannot hold a claimed
// row past the 5-minute stale window.
const REQUEST_TIMEOUT_MS = 20_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ClaimedMessage {
  id: string;
  phone: string;
  body: string;
  attempts: number;
}

interface SendResult {
  id: string;
  status: 'SENT' | 'FAILED';
  provider_uid?: string;
  provider_status?: string;
  cost?: string;
  sms_count?: number;
  error_message?: string;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Sends one message. Never throws — a thrown error here would lose the whole batch's results. */
async function sendOne(msg: ClaimedMessage, senderId: string, dryRun: boolean): Promise<SendResult> {
  if (dryRun) {
    return { id: msg.id, status: 'SENT', provider_status: 'DryRun', cost: '0', sms_count: 1 };
  }

  const outcome = await postToGateway({
    url: TEXTLK_URL,
    token: TEXTLK_TOKEN,
    recipient: msg.phone,
    senderId,
    message: msg.body,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!outcome.ok) {
    return {
      id: msg.id,
      status: 'FAILED',
      provider_status: outcome.providerStatus,
      error_message: outcome.errorMessage,
    };
  }

  return {
    id: msg.id,
    status: 'SENT',
    provider_uid: outcome.providerUid,
    provider_status: outcome.providerStatus,
    cost: outcome.cost,
    sms_count: outcome.smsCount,
  };
}

/** Fixed-size worker pool — keeps at most CONCURRENCY requests in flight. */
async function sendAll(messages: ClaimedMessage[], senderId: string, dryRun: boolean): Promise<SendResult[]> {
  const results: SendResult[] = new Array(messages.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < messages.length) {
      const index = cursor++;
      results[index] = await sendOne(messages[index], senderId, dryRun);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, messages.length) }, worker));
  return results;
}

async function countRemaining(admin: SupabaseClient, campaignId: string): Promise<number> {
  const { count, error } = await admin
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['QUEUED', 'SENDING']);
  if (error) throw error;
  return count ?? 0;
}

// Verification SMS attempts allowed per hour, across all callers. Every
// attempt that reaches the gateway spends a credit and texts a real phone,
// and the app has no per-user auth (SMS-01), so this is the brake on
// someone looping the endpoint.
const VERIFY_MAX_PER_HOUR = 5;

const maskMsisdn = (msisdn: string): string =>
  msisdn.length <= 6 ? '***' : `${msisdn.slice(0, 4)}***${msisdn.slice(-3)}`;

async function handleVerifySender(
  admin: SupabaseClient,
  body: { senderId?: string; phone?: string },
): Promise<Response> {
  const senderId = (body.senderId ?? '').trim();
  const phone = (body.phone ?? '').replace(/\D/g, '');

  const formatError = senderIdFormatError(senderId);
  if (formatError) return json({ error: formatError }, 400);
  if (phone.length < 9 || phone.length > 15) {
    return json({ error: 'Enter the phone number to send the test message to (with country code).' }, 400);
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('sms_sender_checks')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (countError) throw countError;
  if ((count ?? 0) >= VERIFY_MAX_PER_HOUR) {
    return json({ error: `Too many verification attempts (${VERIFY_MAX_PER_HOUR} per hour). Try again later.` }, 429);
  }

  const outcome = await postToGateway({
    url: TEXTLK_URL,
    token: TEXTLK_TOKEN,
    recipient: phone,
    senderId,
    message: `Sender ID test from ${senderId}. If you received this, SMS is set up correctly. No action needed.`,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  const { data: row, error: insertError } = await admin
    .from('sms_sender_checks')
    .insert({
      sender_id: senderId,
      phone_masked: maskMsisdn(phone),
      ok: outcome.ok,
      provider_uid: outcome.providerUid ?? null,
      provider_status: outcome.providerStatus ?? null,
      error_message: outcome.errorMessage ?? null,
    })
    .select('created_at')
    .single();
  if (insertError) throw insertError;

  return json({
    ok: outcome.ok,
    senderId,
    verifiedAt: outcome.ok ? row.created_at : undefined,
    providerUid: outcome.providerUid,
    providerStatus: outcome.providerStatus,
    message: outcome.ok
      ? 'Sender ID accepted by text.lk. A test message was sent — confirm it arrived on the phone.'
      : outcome.errorMessage,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  if (!TEXTLK_TOKEN) {
    return json({ error: 'TEXTLK_API_TOKEN is not set on this function. See docs/sms-setup.md.' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { action?: string; campaignId?: string; batchSize?: number; dryRun?: boolean; senderId?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  // service_role: fn_claim_sms_batch / fn_record_sms_results are granted
  // to this role only, so delivery results cannot be forged by a client.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (body.action === 'verify-sender') {
    try {
      return await handleVerifySender(admin, body);
    } catch (err) {
      console.error('send-sms verify-sender failed', err);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  const campaignId = body.campaignId;
  if (!campaignId) return json({ error: 'campaignId is required' }, 400);

  const batchSize = Math.max(1, Math.min(Number(body.batchSize) || DEFAULT_BATCH_SIZE, 100));
  const dryRun = body.dryRun === true;

  try {
    const { data: campaign, error: campaignError } = await admin
      .from('sms_campaigns')
      .select('id, sender_id, status')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    if (campaign.status === 'CANCELLED') {
      return json({ claimed: 0, sent: 0, failed: 0, remaining: 0, campaignStatus: 'CANCELLED' });
    }

    const senderId = (campaign.sender_id ?? '').trim();
    if (!senderId) {
      return json({ error: 'Campaign has no sender ID. Set one in Settings > SMS and start a new send.' }, 400);
    }

    const { data: claimed, error: claimError } = await admin.rpc('fn_claim_sms_batch', {
      p_campaign_id: campaignId,
      p_limit: batchSize,
    });
    if (claimError) throw claimError;

    const batch = (claimed ?? []) as ClaimedMessage[];

    if (batch.length === 0) {
      // Nothing claimable. Still call the recorder with an empty result set
      // so a campaign whose last batch finished elsewhere gets its terminal
      // status computed instead of being stuck on SENDING.
      const { data: totals, error: recordError } = await admin.rpc('fn_record_sms_results', {
        p_campaign_id: campaignId,
        p_results: [],
      });
      if (recordError) throw recordError;
      const row = Array.isArray(totals) ? totals[0] : totals;
      return json({
        claimed: 0,
        sent: 0,
        failed: 0,
        remaining: row?.pending_count ?? 0,
        campaignStatus: row?.campaign_status ?? campaign.status,
        totals: row ?? null,
      });
    }

    const results = await sendAll(batch, senderId, dryRun);

    const { data: totals, error: recordError } = await admin.rpc('fn_record_sms_results', {
      p_campaign_id: campaignId,
      p_results: results,
    });
    if (recordError) throw recordError;

    const row = Array.isArray(totals) ? totals[0] : totals;
    const remaining = row?.pending_count ?? (await countRemaining(admin, campaignId));

    return json({
      claimed: batch.length,
      sent: results.filter(r => r.status === 'SENT').length,
      failed: results.filter(r => r.status === 'FAILED').length,
      remaining,
      campaignStatus: row?.campaign_status ?? 'SENDING',
      totals: row ?? null,
      dryRun,
    });
  } catch (err) {
    console.error('send-sms failed', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
