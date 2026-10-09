import { describe, it, expect } from 'vitest';
import { normalizePhone, formatMsisdn, smsSegmentInfo, renderSmsBody, buildRecipients } from './sms';
import type { Customer } from '../types';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: over.id ?? 'c1',
  name: over.name ?? 'John Perera',
  phone: over.phone ?? '0771234567',
  email: over.email ?? '',
  loyaltyPoints: over.loyaltyPoints ?? 120,
  totalSpent: over.totalSpent ?? 4500,
  smsOptOut: over.smsOptOut,
});

const ctx = { storeName: 'Hoard Lavish', currencySymbol: 'Rs. ' };

describe('normalizePhone', () => {
  it('accepts every way a Sri Lankan mobile gets typed', () => {
    for (const input of ['0771234567', '771234567', '94771234567', '+94771234567', '+94 77 123 4567', '077-123 4567', '0094771234567']) {
      expect(normalizePhone(input), input).toEqual({ ok: true, msisdn: '94771234567' });
    }
  });

  it('accepts all live LK mobile prefixes', () => {
    for (const prefix of ['70', '71', '72', '74', '75', '76', '77', '78']) {
      expect(normalizePhone(`0${prefix}1234567`).ok, prefix).toBe(true);
    }
  });

  it('rejects landlines — they cannot receive SMS', () => {
    expect(normalizePhone('0112345678').ok).toBe(false);
    expect(normalizePhone('+94112345678').ok).toBe(false);
  });

  it('rejects empty, junk and wrong-length numbers', () => {
    expect(normalizePhone('').ok).toBe(false);
    expect(normalizePhone('   ').ok).toBe(false);
    expect(normalizePhone('n/a').ok).toBe(false);
    expect(normalizePhone('07712345').ok).toBe(false);
    expect(normalizePhone('07712345678').ok).toBe(false);
  });

  it('takes a foreign number only in explicit international form', () => {
    expect(normalizePhone('+447911123456')).toEqual({ ok: true, msisdn: '447911123456' });
    // Same digits without the `+` could be anything — refuse to guess.
    expect(normalizePhone('447911123456').ok).toBe(false);
  });

  it('formats for display', () => {
    expect(formatMsisdn('94771234567')).toBe('+94 77 123 4567');
    expect(formatMsisdn('447911123456')).toBe('+447911123456');
  });
});

describe('smsSegmentInfo', () => {
  it('counts plain ASCII as GSM-7', () => {
    const info = smsSegmentInfo('Hello');
    expect(info).toMatchObject({ encoding: 'GSM7', length: 5, segments: 1, perSegment: 160, remaining: 155 });
  });

  it('treats an empty body as zero segments', () => {
    expect(smsSegmentInfo('')).toMatchObject({ segments: 0, length: 0 });
  });

  it('switches to 153-char segments once concatenated', () => {
    expect(smsSegmentInfo('a'.repeat(160)).segments).toBe(1);
    expect(smsSegmentInfo('a'.repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsSegmentInfo('a'.repeat(306)).segments).toBe(2);
    expect(smsSegmentInfo('a'.repeat(307)).segments).toBe(3);
  });

  it('charges GSM-7 extension characters double', () => {
    expect(smsSegmentInfo('[]{}').length).toBe(8);
    // 80 brackets = 160 units = still one segment, exactly full.
    expect(smsSegmentInfo('['.repeat(80))).toMatchObject({ segments: 1, remaining: 0 });
    expect(smsSegmentInfo('['.repeat(81)).segments).toBe(2);
  });

  it('drops to UCS-2 for non-GSM characters', () => {
    const info = smsSegmentInfo('Hello සුබ');
    expect(info.encoding).toBe('UNICODE');
    expect(info.perSegment).toBe(70);

    expect(smsSegmentInfo('ස'.repeat(70)).segments).toBe(1);
    expect(smsSegmentInfo('ස'.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
  });

  it('counts an emoji as its two surrogate units', () => {
    expect(smsSegmentInfo('\u{1F389}')).toMatchObject({ encoding: 'UNICODE', length: 2 });
  });
});

describe('renderSmsBody', () => {
  it('substitutes every placeholder, repeats included', () => {
    const body = renderSmsBody('Hi {first_name} ({name}), {points} pts, spent {spent} at {store}. Bye {first_name}!', customer(), ctx);
    expect(body).toBe('Hi John (John Perera), 120 pts, spent Rs. 4500.00 at Hoard Lavish. Bye John!');
  });

  it('leaves an unknown placeholder visible instead of deleting it', () => {
    expect(renderSmsBody('Hi {nickname}', customer(), ctx)).toBe('Hi {nickname}');
  });

  it('survives a one-word name', () => {
    expect(renderSmsBody('{first_name}', customer({ name: 'Perera' }), ctx)).toBe('Perera');
  });
});

describe('buildRecipients', () => {
  it('queues valid customers and totals their segments', () => {
    const built = buildRecipients(
      [customer({ id: 'a', phone: '0771234567' }), customer({ id: 'b', name: 'Amara', phone: '0712223334' })],
      'Hi {first_name}',
      ctx
    );
    expect(built.queued.map(r => r.phone)).toEqual(['94771234567', '94712223334']);
    expect(built.queued.map(r => r.body)).toEqual(['Hi John', 'Hi Amara']);
    expect(built.skipped).toHaveLength(0);
    expect(built.segments).toBe(2);
  });

  it('skips opt-outs, bad numbers and duplicates with a reason each', () => {
    const built = buildRecipients(
      [
        customer({ id: 'a', phone: '0771234567' }),
        customer({ id: 'b', name: 'Opted Out', phone: '0712223334', smsOptOut: true }),
        customer({ id: 'c', name: 'Bad Number', phone: '0112345678' }),
        customer({ id: 'd', name: 'Same Phone', phone: '+94 77 123 4567' }),
      ],
      'Hi',
      ctx
    );

    expect(built.queued).toHaveLength(1);
    expect(built.skipped).toHaveLength(3);
    expect(built.skipped.map(s => s.customer_name)).toEqual(['Opted Out', 'Bad Number', 'Same Phone']);
    expect(built.skipped[0].error_message).toMatch(/opted out/i);
    expect(built.skipped[1].error_message).toMatch(/not a valid sri lankan mobile/i);
    expect(built.skipped[2].error_message).toMatch(/duplicate/i);
    // Duplicate points at the customer who IS getting the message.
    expect(built.skipped[2].error_message).toContain('John Perera');
  });

  it('keeps the raw phone on skipped rows so the operator can fix the data', () => {
    const built = buildRecipients([customer({ phone: '0112345678' })], 'Hi', ctx);
    expect(built.skipped[0].raw_phone).toBe('0112345678');
  });

  it('counts multi-segment bodies once per segment', () => {
    const built = buildRecipients([customer(), customer({ id: 'b', phone: '0712223334' })], 'a'.repeat(200), ctx);
    expect(built.segments).toBe(4);
  });
});
