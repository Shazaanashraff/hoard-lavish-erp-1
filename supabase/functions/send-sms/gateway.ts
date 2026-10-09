// ============================================================
// text.lk gateway helpers for the `send-sms` Edge Function.
//
// Kept free of Deno globals and of any Supabase import on purpose: this
// file is also imported by Vitest (tests/sms-gateway.test.ts), so the
// response mapping — the part that decides SENT vs FAILED, i.e. what
// gets billed and reported — has real tests instead of being buried in
// the request handler.
// ============================================================

export interface GatewayOutcome {
  ok: boolean;
  providerUid?: string;
  providerStatus?: string;
  cost?: string;
  smsCount?: number;
  errorMessage?: string;
}

/**
 * Turns one raw text.lk reply into an outcome. Never throws.
 *
 * text.lk signals failure two ways — a non-2xx status, or HTTP 200 with
 * `status:"error"` — and both must come out as `ok: false`. A body that is
 * not JSON at all (proxy interstitial, HTML error page) is also a failure,
 * with a short excerpt kept so the operator can see what came back.
 */
export function interpretGatewayResponse(httpStatus: number, raw: string): GatewayOutcome {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return {
      ok: false,
      errorMessage: `Gateway returned non-JSON (HTTP ${httpStatus}): ${raw.slice(0, 180)}`,
    };
  }
  // JSON.parse('null') / '42' / '"x"' are valid JSON but not an object.
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, errorMessage: `Gateway returned an unexpected body (HTTP ${httpStatus})` };
  }

  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const ok = httpStatus >= 200 && httpStatus < 300 && parsed.status === 'success';

  if (!ok) {
    return {
      ok: false,
      providerStatus: typeof data.status === 'string' ? data.status : undefined,
      errorMessage: String(parsed.message ?? `Gateway rejected the message (HTTP ${httpStatus})`).slice(0, 300),
    };
  }

  return {
    ok: true,
    providerUid: typeof data.uid === 'string' ? data.uid : undefined,
    providerStatus: typeof data.status === 'string' ? data.status : undefined,
    cost: data.cost != null ? String(data.cost) : undefined,
    smsCount: data.sms_count != null ? Number(data.sms_count) : undefined,
  };
}

export interface GatewayRequest {
  url: string;
  token: string;
  recipient: string;
  senderId: string;
  message: string;
  timeoutMs: number;
}

/** One POST to text.lk. Never throws — network failure and timeout come back as `ok: false`. */
export async function postToGateway(req: GatewayRequest): Promise<GatewayOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);

  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient: req.recipient,
        sender_id: req.senderId,
        type: 'plain',
        message: req.message,
      }),
      signal: controller.signal,
    });
    return interpretGatewayResponse(res.status, await res.text());
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === 'AbortError';
    return {
      ok: false,
      errorMessage: aborted
        ? `Gateway did not respond within ${req.timeoutMs / 1000}s`
        : `Could not reach the SMS gateway: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Sender ID rules
// ------------------------------------------------------------

/**
 * text.lk: a sender ID is "a telephone number with country code or an
 * alphanumeric string", the latter at most 11 characters. Spaces and
 * symbols are rejected here because carriers reject them; the real
 * authority on whether an ID is *approved* is the gateway, which is why
 * the verify step exists.
 *
 * Returns an error message, or `null` when the format is acceptable.
 * Mirrored client-side in utils/sms.ts (validateSenderId) — the shared
 * test table in tests/sms-gateway.test.ts keeps the two from drifting.
 */
export function senderIdFormatError(raw: string): string | null {
  const id = (raw ?? '').trim();
  if (!id) return 'Enter a sender ID.';
  if (/^\d+$/.test(id)) {
    return id.length >= 9 && id.length <= 15
      ? null
      : 'A numeric sender ID must be a phone number with country code (9–15 digits).';
  }
  if (!/^[A-Za-z0-9]+$/.test(id)) return 'Use letters and digits only — no spaces or symbols.';
  if (id.length > 11) return 'An alphanumeric sender ID can be at most 11 characters.';
  return null;
}
