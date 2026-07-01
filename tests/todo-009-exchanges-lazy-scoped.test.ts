/**
 * TODO-009 completion verification: exchanges are lazy + scoped (egress reduction).
 * Run: npx vitest run tests/todo-009-exchanges-lazy-scoped.test.ts
 *
 * Structural source checks (mirrors the plumbing test in localProducts.test.ts):
 * the dominant egress path was the 30s poll re-downloading all-time exchanges.
 * These assertions lock in that exchanges are no longer polled and that the
 * initial load is scoped to a 2-week window.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../context/StoreContext.tsx'), 'utf8');

describe('TODO-009 — refreshFromSupabase no longer fetches exchanges', () => {
  it('the polled refresh function body does not call fetchExchanges', () => {
    const fnStart = src.indexOf('const refreshFromSupabase');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = src.indexOf('}, [useSupabase]);', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('fetchExchanges');
    expect(fnBody).not.toContain('setExchangeHistory');
  });
});

describe('TODO-009 — initial load is scoped to the last 2 weeks', () => {
  it('init load fetches exchanges with a twoWeeksAgoDate dateFrom', () => {
    expect(src).toContain("db.fetchExchanges({ dateFrom: twoWeeksAgoDate(today) })");
  });

  it('init load serves from the daily exchanges cache when present', () => {
    expect(src).toContain('loadCachedExchanges()');
    expect(src).toContain('saveCachedExchanges(exchangeData, today)');
  });
});

describe('TODO-009 — background poll is gated on realtime health', () => {
  it('the 30s interval only refreshes when shouldPoll(realtimeStatus) is true', () => {
    expect(src).toContain('if (shouldPoll(realtimeStatusRef.current))');
  });
});

describe('TODO-009 — cross-device sync uses a scoped recent-merge handler', () => {
  it('exchanges/exchange_items realtime events route to onExchangeEvent (not the all-time onEvent)', () => {
    expect(src).toContain("table: 'exchanges' }, onExchangeEvent");
    expect(src).toContain("table: 'exchange_items' }, onExchangeEvent");
  });
});
