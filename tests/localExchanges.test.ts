/**
 * Unit tests for the exchanges cache + scoped-loading helpers (egress reduction).
 * Run: npx vitest run tests/localExchanges.test.ts
 *
 * All functions run in NODE_ENV=test with the in-memory backend.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ExchangeRecord } from '../types';
import {
  loadCachedExchanges,
  saveCachedExchanges,
  mergeExchangesById,
  exchangesDiffer,
  twoWeeksAgoDate,
  isRangeWithinCache,
  shouldPoll,
} from '../services/localExchanges';

// ─── seed data ────────────────────────────────────────────────────────────────

const makeEx = (overrides: Partial<ExchangeRecord> & { exchangeNumber: string }): ExchangeRecord => ({
  id: overrides.id ?? `id-${Math.random().toString(36).slice(2, 8)}`,
  exchangeNumber: overrides.exchangeNumber,
  date: overrides.date ?? '2026-06-20T00:00:00.000Z',
  returnedItems: overrides.returnedItems ?? [],
  newItems: overrides.newItems ?? [],
  returnedTotal: overrides.returnedTotal ?? 0,
  newTotal: overrides.newTotal ?? 0,
  difference: overrides.difference ?? 0,
  paymentMethod: overrides.paymentMethod ?? 'Cash',
  branchId: overrides.branchId ?? 'branch-a',
  branchName: overrides.branchName ?? 'Main',
  description: overrides.description ?? '',
});

// ─── cache module ──────────────────────────────────────────────────────────────

describe('localExchanges cache module', () => {
  beforeEach(() => { saveCachedExchanges([], '__reset__'); });

  it('round-trips exchanges via save/load with a cache date', () => {
    const ex = [makeEx({ exchangeNumber: 'EX-1', date: '2026-06-20T00:00:00.000Z' })];
    saveCachedExchanges(ex, '2026-06-29');
    const loaded = loadCachedExchanges();
    expect(loaded).not.toBeNull();
    expect(loaded!.cachedDate).toBe('2026-06-29');
    expect(loaded!.exchanges).toHaveLength(1);
    expect(loaded!.exchanges[0].exchangeNumber).toBe('EX-1');
  });
});

// ─── mergeExchangesById ─────────────────────────────────────────────────────────

describe('mergeExchangesById', () => {
  it('unions disjoint sets and keeps date-descending order', () => {
    const a = [makeEx({ exchangeNumber: 'EX-1', date: '2026-06-10T00:00:00.000Z' })];
    const b = [makeEx({ exchangeNumber: 'EX-2', date: '2026-06-20T00:00:00.000Z' })];
    const merged = mergeExchangesById(a, b);
    expect(merged.map(e => e.exchangeNumber)).toEqual(['EX-2', 'EX-1']); // newest first
  });

  it('dedups by exchangeNumber even when the id differs (optimistic vs server)', () => {
    const optimistic = makeEx({ exchangeNumber: 'EX-9', id: 'client-rand', difference: 100 });
    const serverEcho = makeEx({ exchangeNumber: 'EX-9', id: 'server-uuid', difference: 100 });
    const merged = mergeExchangesById([optimistic], [serverEcho]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('server-uuid'); // incoming (server) wins → id reconciled
  });

  it('incoming overwrites existing on key collision', () => {
    const before = makeEx({ exchangeNumber: 'EX-5', difference: 50 });
    const after = makeEx({ exchangeNumber: 'EX-5', difference: 75 });
    const merged = mergeExchangesById([before], [after]);
    expect(merged).toHaveLength(1);
    expect(merged[0].difference).toBe(75);
  });

  it('handles empty arrays', () => {
    expect(mergeExchangesById([], [])).toEqual([]);
    const one = [makeEx({ exchangeNumber: 'EX-1' })];
    expect(mergeExchangesById(one, [])).toHaveLength(1);
    expect(mergeExchangesById([], one)).toHaveLength(1);
  });
});

// ─── exchangesDiffer ────────────────────────────────────────────────────────────

describe('exchangesDiffer', () => {
  const base = [
    makeEx({ exchangeNumber: 'EX-1', date: '2026-06-10T00:00:00.000Z', difference: 10 }),
    makeEx({ exchangeNumber: 'EX-2', date: '2026-06-20T00:00:00.000Z', difference: -5 }),
  ];

  it('is false for identical content (gates needless re-render)', () => {
    const copy = base.map(e => ({ ...e }));
    expect(exchangesDiffer(base, copy)).toBe(false);
  });

  it('is false regardless of order (compares by sorted signature)', () => {
    expect(exchangesDiffer(base, [base[1], base[0]])).toBe(false);
  });

  it('is true when a row is added or removed', () => {
    expect(exchangesDiffer(base, base.slice(0, 1))).toBe(true);
    expect(exchangesDiffer(base, [...base, makeEx({ exchangeNumber: 'EX-3' })])).toBe(true);
  });

  it('is true when a tracked field mutates', () => {
    const mutated = [{ ...base[0], difference: 999 }, base[1]];
    expect(exchangesDiffer(base, mutated)).toBe(true);
  });
});

// ─── twoWeeksAgoDate ────────────────────────────────────────────────────────────

describe('twoWeeksAgoDate', () => {
  it('subtracts exactly 14 days', () => {
    expect(twoWeeksAgoDate('2026-06-29')).toBe('2026-06-15');
  });
  it('handles month rollover', () => {
    expect(twoWeeksAgoDate('2026-06-10')).toBe('2026-05-27');
  });
  it('handles year rollover', () => {
    expect(twoWeeksAgoDate('2026-01-05')).toBe('2025-12-22');
  });
  it('handles leap-year February', () => {
    // 2028 is a leap year → Feb has 29 days
    expect(twoWeeksAgoDate('2028-03-05')).toBe('2028-02-20');
  });
});

// ─── isRangeWithinCache ─────────────────────────────────────────────────────────

describe('isRangeWithinCache', () => {
  const floor = '2026-06-15';
  it('returns false for an unbounded (ALL) range', () => {
    expect(isRangeWithinCache(undefined, floor)).toBe(false);
  });
  it('returns true when from equals the cache floor', () => {
    expect(isRangeWithinCache('2026-06-15', floor)).toBe(true);
  });
  it('returns true when from is newer than the floor', () => {
    expect(isRangeWithinCache('2026-06-20', floor)).toBe(true);
  });
  it('returns false when from is older than the floor', () => {
    expect(isRangeWithinCache('2026-06-01', floor)).toBe(false);
  });
});

// ─── shouldPoll ─────────────────────────────────────────────────────────────────

describe('shouldPoll', () => {
  it('does not poll while realtime is SUBSCRIBED', () => {
    expect(shouldPoll('SUBSCRIBED')).toBe(false);
  });
  it('polls in every other state (fallback)', () => {
    for (const s of ['CONNECTING', 'TIMED_OUT', 'CLOSED', 'CHANNEL_ERROR', null]) {
      expect(shouldPoll(s as any)).toBe(true);
    }
  });
});
