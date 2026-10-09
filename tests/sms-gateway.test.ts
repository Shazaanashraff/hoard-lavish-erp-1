import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  interpretGatewayResponse,
  postToGateway,
  senderIdFormatError,
} from '../supabase/functions/send-sms/gateway';
import { validateSenderId } from '../utils/sms';

// Payload shapes are the ones in text.lk's published "Send SMS" docs
// (https://text.lk/docs/send-sms/): success carries data.uid/status/cost/
// sms_count; failure is {status:"error", message}.
const SUCCESS = JSON.stringify({
  status: 'success',
  message: 'Your message was successfully delivered',
  data: { uid: 'abc123', to: '94771234567', from: 'HoardLavish', status: 'Delivered', cost: '1', sms_count: 1 },
});

describe('interpretGatewayResponse', () => {
  it('maps a success reply to ok with the provider reference and billing', () => {
    expect(interpretGatewayResponse(200, SUCCESS)).toEqual({
      ok: true,
      providerUid: 'abc123',
      providerStatus: 'Delivered',
      cost: '1',
      smsCount: 1,
    });
  });

  it('treats HTTP 200 with status:"error" as a failure carrying the gateway message', () => {
    const out = interpretGatewayResponse(200, JSON.stringify({ status: 'error', message: 'Sender ID is not approved' }));
    expect(out.ok).toBe(false);
    expect(out.errorMessage).toBe('Sender ID is not approved');
  });

  it('treats a non-2xx as a failure even when the body claims success', () => {
    expect(interpretGatewayResponse(500, SUCCESS).ok).toBe(false);
  });

  it('keeps an excerpt of a non-JSON body and the HTTP status', () => {
    const out = interpretGatewayResponse(502, '<html>Bad gateway</html>');
    expect(out.ok).toBe(false);
    expect(out.errorMessage).toContain('non-JSON');
    expect(out.errorMessage).toContain('502');
    expect(out.errorMessage).toContain('Bad gateway');
  });

  it('truncates an oversized non-JSON body', () => {
    const out = interpretGatewayResponse(502, 'x'.repeat(5000));
    expect(out.errorMessage!.length).toBeLessThan(260);
  });

  it('does not throw on an empty body', () => {
    const out = interpretGatewayResponse(200, '');
    expect(out.ok).toBe(false);
    expect(out.errorMessage).toContain('HTTP 200');
  });

  it('does not throw on JSON that is not an object', () => {
    expect(interpretGatewayResponse(200, 'null').ok).toBe(false);
    expect(interpretGatewayResponse(200, '42').ok).toBe(false);
  });

  it('falls back to a generic message when an error reply has none', () => {
    const out = interpretGatewayResponse(422, JSON.stringify({ status: 'error' }));
    expect(out.errorMessage).toContain('HTTP 422');
  });

  it('caps a very long gateway message', () => {
    const out = interpretGatewayResponse(200, JSON.stringify({ status: 'error', message: 'm'.repeat(1000) }));
    expect(out.errorMessage!.length).toBe(300);
  });

  it('tolerates a success reply missing optional data fields', () => {
    const out = interpretGatewayResponse(200, JSON.stringify({ status: 'success', data: {} }));
    expect(out).toEqual({
      ok: true,
      providerUid: undefined,
      providerStatus: undefined,
      cost: undefined,
      smsCount: undefined,
    });
  });
});

describe('postToGateway', () => {
  const req = {
    url: 'https://app.text.lk/api/v3/sms/send',
    token: 'secret-token',
    recipient: '94771234567',
    senderId: 'HoardLavish',
    message: 'hello',
    timeoutMs: 50,
  };

  afterEach(() => vi.unstubAllGlobals());

  it('sends the documented body with a Bearer header and parses the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(SUCCESS, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await postToGateway(req);

    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(req.url);
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body)).toEqual({
      recipient: '94771234567',
      sender_id: 'HoardLavish',
      type: 'plain',
      message: 'hello',
    });
  });

  it('reports a network failure as ok:false instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const out = await postToGateway(req);
    expect(out.ok).toBe(false);
    expect(out.errorMessage).toContain('Could not reach the SMS gateway');
    expect(out.errorMessage).toContain('ECONNRESET');
  });

  it('reports a hung gateway as a timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })),
    );
    const out = await postToGateway(req);
    expect(out.ok).toBe(false);
    expect(out.errorMessage).toContain('did not respond');
  });
});

// One table, run through the server-side and client-side validators, so the
// two copies of the rule cannot drift apart.
describe('sender ID format (server and client copies agree)', () => {
  const cases: Array<[string, boolean]> = [
    ['HoardLavish', true],       // exactly 11 chars — at the limit
    ['Hoard', true],
    ['ABC123', true],
    ['  Hoard  ', true],         // trimmed
    ['TextLKDemo', true],        // from text.lk's own docs
    ['', false],
    ['   ', false],
    ['Hoard Lavish', false],     // space
    ['Hoard-Lav', false],        // symbol
    ['HoardLavishLK', false],    // 13 chars
    ['94771234567', true],       // phone number with country code
    ['771234567', true],         // 9 digits (lower bound)
    ['12345678', false],         // 8 digits — too short to be a number
    ['9477123456789012', false], // 16 digits — too long
  ];

  it.each(cases)('%j', (input, valid) => {
    expect(senderIdFormatError(input) === null).toBe(valid);
    expect(validateSenderId(input) === null).toBe(valid);
  });

  it('returns identical messages from both copies', () => {
    for (const [input] of cases) {
      expect(validateSenderId(input)).toBe(senderIdFormatError(input));
    }
  });
});
