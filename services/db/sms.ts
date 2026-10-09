import { supabase } from '../supabaseClient';
import type { SmsCampaign, SmsMessage, SmsSenderVerification, SmsSenderCheckResult } from '../../types';
import type { SmsRecipient } from '../../utils/sms';
import { asUuidOrNull } from './shared';

// DB layer for SMS campaigns. Every write goes through an RPC — the anon
// role has SELECT only on both tables (migration 019, section 8), so
// there is deliberately no insert/update helper here to reach for.

export const mapSmsCampaign = (r: any): SmsCampaign => ({
    id: r.id,
    name: r.name,
    message: r.message,
    senderId: r.sender_id,
    status: r.status,
    audience: r.audience,
    totalCount: r.total_count,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    skippedCount: r.skipped_count,
    totalCost: Number(r.total_cost ?? 0),
    createdBy: r.created_by ?? undefined,
    createdByName: r.created_by_name,
    branchId: r.branch_id ?? undefined,
    branchName: r.branch_name,
    errorMessage: r.error_message ?? undefined,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
});

export const mapSmsMessage = (r: any): SmsMessage => ({
    id: r.id,
    campaignId: r.campaign_id,
    customerId: r.customer_id ?? undefined,
    customerName: r.customer_name,
    phone: r.phone,
    rawPhone: r.raw_phone,
    body: r.body,
    status: r.status,
    providerUid: r.provider_uid ?? undefined,
    providerStatus: r.provider_status ?? undefined,
    cost: r.cost == null ? undefined : Number(r.cost),
    smsCount: r.sms_count ?? undefined,
    errorMessage: r.error_message ?? undefined,
    attempts: r.attempts,
    sentAt: r.sent_at ?? undefined,
    createdAt: r.created_at,
});

// Campaign rows only — the per-recipient log is fetched on demand when a
// campaign is expanded, so opening the history screen stays cheap.
export async function fetchSmsCampaigns(limit = 50): Promise<SmsCampaign[]> {
    const { data, error } = await supabase
        .from('sms_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapSmsCampaign);
}

export async function fetchSmsCampaign(campaignId: string): Promise<SmsCampaign> {
    const { data, error } = await supabase.from('sms_campaigns').select('*').eq('id', campaignId).single();
    if (error) throw error;
    return mapSmsCampaign(data);
}

export async function fetchSmsMessages(campaignId: string, opts?: { status?: SmsMessage['status'] }): Promise<SmsMessage[]> {
    let query = supabase.from('sms_messages').select('*').eq('campaign_id', campaignId);
    if (opts?.status) query = query.eq('status', opts.status);
    const { data, error } = await query.order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapSmsMessage);
}

export interface CreateSmsCampaignInput {
    name: string;
    /** The template as typed, placeholders intact — stored for the audit trail. */
    message: string;
    audience: SmsCampaign['audience'];
    createdBy?: string;
    createdByName: string;
    branchId?: string;
    branchName: string;
    /** Already normalized, deduplicated and rendered by utils/sms.buildRecipients. */
    recipients: SmsRecipient[];
}

/**
 * Creates the campaign + its message rows in one transaction. The RPC
 * re-validates the enable switch, sender ID, daily cap and opt-outs, so
 * its errors are meant to be shown to the operator verbatim.
 */
export async function createSmsCampaign(input: CreateSmsCampaignInput): Promise<string> {
    const { data, error } = await supabase.rpc('fn_create_sms_campaign', {
        p_name: input.name,
        p_message: input.message,
        p_audience: input.audience,
        p_created_by: asUuidOrNull(input.createdBy),
        p_created_by_name: input.createdByName,
        p_branch_id: asUuidOrNull(input.branchId),
        p_branch_name: input.branchName,
        p_recipients: input.recipients,
    });
    if (error) throw error;
    return data as string;
}

export interface SendSmsBatchResult {
    claimed: number;
    sent: number;
    failed: number;
    remaining: number;
    campaignStatus: SmsCampaign['status'];
    dryRun?: boolean;
}

/**
 * A non-2xx from the function arrives as a FunctionsHttpError whose body
 * holds our own `{ error }` — dig it out, otherwise the operator just sees
 * "Edge Function returned a non-2xx status code".
 */
async function invokeSendSms<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('send-sms', { body });

    if (error) {
        const context = (error as { context?: Response }).context;
        let detail: string | null = null;
        if (context && typeof context.json === 'function') {
            // Parse in its own try so a failed parse falls back to the raw
            // error — and so the throw below is never caught by this catch.
            try {
                const payload = await context.json();
                if (payload?.error) detail = String(payload.error);
            } catch {
                detail = null;
            }
        }
        if (detail) throw new Error(detail);
        throw error;
    }

    if (data?.error) throw new Error(String(data.error));
    return data as T;
}

/**
 * Runs ONE batch through the `send-sms` Edge Function (which owns the
 * text.lk token). Callers loop until `remaining === 0` — see
 * StoreContext.runSmsCampaign.
 */
export async function sendSmsBatch(campaignId: string, opts?: { batchSize?: number; dryRun?: boolean }): Promise<SendSmsBatchResult> {
    return invokeSendSms<SendSmsBatchResult>({ campaignId, batchSize: opts?.batchSize, dryRun: opts?.dryRun });
}

/**
 * Most recent successful verification of exactly this sender ID, or null.
 * "Verified" is derived from the log, so editing the ID in Settings
 * un-verifies it with no flag to reset (migration 020, note 2).
 */
export async function fetchSmsSenderVerification(senderId: string): Promise<SmsSenderVerification | null> {
    const id = senderId.trim();
    if (!id) return null;
    const { data, error } = await supabase
        .from('sms_sender_checks')
        .select('sender_id, phone_masked, created_at')
        .eq('ok', true)
        .eq('sender_id', id)
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    const row = data?.[0];
    return row ? { senderId: row.sender_id, verifiedAt: row.created_at, phoneMasked: row.phone_masked } : null;
}

/**
 * Sends one real test SMS from `senderId` to `phone` (digits, with country
 * code) through the Edge Function, which logs the gateway's verdict. Costs
 * one credit. A gateway rejection comes back as `{ ok: false, message }`;
 * only transport / validation / rate-limit problems throw.
 */
export async function verifySmsSender(senderId: string, phone: string): Promise<SmsSenderCheckResult> {
    return invokeSendSms<SmsSenderCheckResult>({ action: 'verify-sender', senderId, phone });
}

/** Stops a campaign: un-sent recipients become SKIPPED. Returns how many. */
export async function cancelSmsCampaign(campaignId: string): Promise<number> {
    const { data, error } = await supabase.rpc('fn_cancel_sms_campaign', { p_campaign_id: campaignId });
    if (error) throw error;
    return Number(data ?? 0);
}

/** Requeues the FAILED recipients of a finished campaign. Returns how many. */
export async function requeueFailedSms(campaignId: string): Promise<number> {
    const { data, error } = await supabase.rpc('fn_requeue_failed_sms', { p_campaign_id: campaignId });
    if (error) throw error;
    return Number(data ?? 0);
}

/** Removes a campaign from history; its sms_messages cascade. */
export async function deleteSmsCampaign(campaignId: string): Promise<void> {
    const { error } = await supabase.from('sms_campaigns').delete().eq('id', campaignId);
    if (error) throw error;
}
