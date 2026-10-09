// SMS helpers — phone normalization, GSM-7/UCS-2 segment counting, and
// placeholder rendering. Pure functions, no I/O: the composer, the
// StoreContext action, and the tests all share exactly this logic so the
// count shown to the operator is the count that gets charged.

import type { Customer } from '../types';

// ============================================================
// Phone normalization
// ============================================================

// Sri Lankan mobile prefixes in use (07x). Landlines cannot receive SMS,
// so anything that is not 7x after the country code is rejected rather
// than silently sent and billed as a failure.
const LK_MOBILE_PREFIX = /^7[0-8]\d{7}$/;

// One flat shape rather than a discriminated union: this project compiles
// with `strict` off, and without strictNullChecks TypeScript will not narrow
// `{ok:true,…} | {ok:false,…}` on an `if (!result.ok)` check.
export interface PhoneNormalizationResult {
  ok: boolean;
  /** Digits-only international form (e.g. `94771234567`); `''` when !ok. */
  msisdn: string;
  /** Why the number was rejected; only set when !ok. */
  reason?: string;
}

/**
 * Turns whatever a cashier typed into the digits-only international form
 * text.lk expects (no `+`, e.g. `94771234567`).
 *
 * Accepted: `0771234567`, `771234567`, `94771234567`, `+94 77 123 4567`,
 * `077-123 4567`, and non-LK numbers written with a leading `+`.
 */
export const normalizePhone = (raw: string): PhoneNormalizationResult => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: false, msisdn: '', reason: 'No phone number' };

  const hadPlus = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return { ok: false, msisdn: '', reason: 'No digits in phone number' };

  // Already country-coded for Sri Lanka.
  if (digits.startsWith('94')) {
    const local = digits.slice(2);
    return LK_MOBILE_PREFIX.test(local)
      ? { ok: true, msisdn: `94${local}` }
      : { ok: false, msisdn: '', reason: `Not a valid Sri Lankan mobile number: ${raw}` };
  }

  // Local trunk form: 0771234567.
  if (digits.startsWith('0')) {
    const local = digits.slice(1);
    return LK_MOBILE_PREFIX.test(local)
      ? { ok: true, msisdn: `94${local}` }
      : { ok: false, msisdn: '', reason: `Not a valid Sri Lankan mobile number: ${raw}` };
  }

  // Bare national form: 771234567.
  if (LK_MOBILE_PREFIX.test(digits)) {
    return { ok: true, msisdn: `94${digits}` };
  }

  // Foreign number — only trusted when the operator wrote it in
  // international form, since we have no dial plan to validate it
  // against and a mis-guessed country code sends to a stranger.
  if (hadPlus && digits.length >= 8 && digits.length <= 15) {
    return { ok: true, msisdn: digits };
  }

  return {
    ok: false,
    msisdn: '',
    reason: hadPlus
      ? `Phone number is not a usable international number: ${raw}`
      : `Unrecognized phone number (write foreign numbers as +<country code>…): ${raw}`,
  };
};

/** Display form for a normalized msisdn: `94771234567` -> `+94 77 123 4567`. */
export const formatMsisdn = (msisdn: string): string => {
  if (/^94\d{9}$/.test(msisdn)) {
    const l = msisdn.slice(2);
    return `+94 ${l.slice(0, 2)} ${l.slice(2, 5)} ${l.slice(5)}`;
  }
  return `+${msisdn}`;
};

// ============================================================
// Sender ID format
// ============================================================

/**
 * Format check for a text.lk sender ID: a phone number with country code
 * (9–15 digits) or an alphanumeric string of at most 11 characters.
 * Returns the problem to show the operator, or `null` when it is fine.
 *
 * Format only — whether text.lk has *approved* the ID is answered by the
 * gateway (Settings → SMS → Verify). Mirrors `senderIdFormatError` in
 * supabase/functions/send-sms/gateway.ts; tests/sms-gateway.test.ts runs
 * one table through both so they cannot drift apart.
 */
export const validateSenderId = (raw: string): string | null => {
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
};

// ============================================================
// Segment counting
// ============================================================

// GSM 03.38 basic character set. Anything outside this (and the extension
// table below) forces the whole message to UCS-2, which more than halves
// the per-segment capacity — hence the composer's "one emoji costs you
// half the message" warning.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Characters that exist in GSM-7 only via an escape sequence, so they
// occupy two of the 160 slots.
const GSM7_EXTENDED = '\f^{}\\[~]|€';

export interface SmsSegmentInfo {
  encoding: 'GSM7' | 'UNICODE';
  /** Billable units, after the GSM-7 extension chars are double-counted. */
  length: number;
  /** How many SMS the gateway will charge for. */
  segments: number;
  /** Units left in the current segment. */
  remaining: number;
  /** Per-segment capacity at this encoding and segment count. */
  perSegment: number;
}

/**
 * Counts SMS segments the way a gateway does: 160 GSM-7 chars for a
 * single message, 153 once it is concatenated (7 bytes go to the UDH),
 * and 70 / 67 for UCS-2.
 */
export const smsSegmentInfo = (body: string): SmsSegmentInfo => {
  const text = body ?? '';
  let isGsm7 = true;
  let length = 0;

  for (const char of text) {
    if (GSM7_BASIC.includes(char)) {
      length += 1;
    } else if (GSM7_EXTENDED.includes(char)) {
      length += 2;
    } else {
      isGsm7 = false;
      break;
    }
  }

  if (!isGsm7) {
    // UCS-2 is billed per 16-bit code unit, so an astral character
    // (emoji, most of them) counts as its two surrogates.
    length = text.length;
    const single = 70;
    const multi = 67;
    const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
    const perSegment = segments > 1 ? multi : single;
    return {
      encoding: 'UNICODE',
      length,
      segments,
      perSegment,
      remaining: Math.max(0, segments * perSegment - length),
    };
  }

  const single = 160;
  const multi = 153;
  const segments = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  const perSegment = segments > 1 ? multi : single;
  return {
    encoding: 'GSM7',
    length,
    segments,
    perSegment,
    remaining: Math.max(0, segments * perSegment - length),
  };
};

// ============================================================
// Placeholders
// ============================================================

export const SMS_PLACEHOLDERS = [
  { token: '{name}', label: 'Customer name' },
  { token: '{first_name}', label: 'First name only' },
  { token: '{points}', label: 'Loyalty points' },
  { token: '{spent}', label: 'Lifetime spend' },
  { token: '{store}', label: 'Store name' },
] as const;

export interface RenderContext {
  storeName: string;
  currencySymbol: string;
}

/**
 * Substitutes the placeholders for one customer. Unknown `{tokens}` are
 * left as typed — a typo should be visible in the preview rather than
 * silently deleted from the delivered message.
 */
export const renderSmsBody = (template: string, customer: Customer, ctx: RenderContext): string => {
  const name = (customer.name ?? '').trim();
  const firstName = name.split(/\s+/)[0] ?? '';
  return (template ?? '')
    .replaceAll('{name}', name)
    .replaceAll('{first_name}', firstName)
    .replaceAll('{points}', String(customer.loyaltyPoints ?? 0))
    .replaceAll('{spent}', `${ctx.currencySymbol}${Number(customer.totalSpent ?? 0).toFixed(2)}`)
    .replaceAll('{store}', ctx.storeName ?? '');
};

// ============================================================
// Recipient list building
// ============================================================

export interface SmsRecipient {
  customer_id: string;
  customer_name: string;
  phone: string;
  raw_phone: string;
  body: string;
  status: 'QUEUED' | 'SKIPPED';
  error_message?: string;
}

export interface BuiltRecipients {
  /** Sendable, deduplicated by normalized number. */
  queued: SmsRecipient[];
  /** Everyone excluded, each with the reason shown in the composer. */
  skipped: SmsRecipient[];
  /** Total billable segments across `queued` — the cost estimate. */
  segments: number;
}

/**
 * Turns selected customers into the recipient payload for
 * `fn_create_sms_campaign`. Excludes opt-outs and unusable numbers, and
 * collapses duplicate numbers (a household sharing one phone is one SMS,
 * not two) keeping the first customer as the one on record.
 */
export const buildRecipients = (
  customers: Customer[],
  template: string,
  ctx: RenderContext
): BuiltRecipients => {
  const queued: SmsRecipient[] = [];
  const skipped: SmsRecipient[] = [];
  const seen = new Map<string, string>();
  let segments = 0;

  for (const customer of customers) {
    const body = renderSmsBody(template, customer, ctx);
    const base = {
      customer_id: customer.id,
      customer_name: customer.name,
      raw_phone: customer.phone ?? '',
      body,
    };

    if (customer.smsOptOut) {
      skipped.push({ ...base, phone: customer.phone ?? '', status: 'SKIPPED', error_message: 'Customer opted out of SMS' });
      continue;
    }

    const normalized = normalizePhone(customer.phone ?? '');
    if (!normalized.ok) {
      skipped.push({ ...base, phone: customer.phone ?? '', status: 'SKIPPED', error_message: normalized.reason });
      continue;
    }

    const duplicateOf = seen.get(normalized.msisdn);
    if (duplicateOf) {
      skipped.push({
        ...base,
        phone: normalized.msisdn,
        status: 'SKIPPED',
        error_message: `Duplicate number — already sending to ${duplicateOf}`,
      });
      continue;
    }

    seen.set(normalized.msisdn, customer.name);
    queued.push({ ...base, phone: normalized.msisdn, status: 'QUEUED' });
    segments += smsSegmentInfo(body).segments;
  }

  return { queued, skipped, segments };
};
