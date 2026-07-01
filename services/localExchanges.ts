// Local exchanges cache — electron-store with in-memory fallback for tests.
// Mirrors the pattern in localProducts.ts.
//
// Egress note: the app default-loads only the last 2 weeks of exchanges and
// caches them for the day. Older ranges are fetched on demand by reports.
/* eslint-disable @typescript-eslint/no-var-requires */
import type { ExchangeRecord } from '../types';

let Store: any;
try {
  // @ts-ignore
  Store = require('electron-store');
} catch (e) {
  Store = undefined;
}

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };
let backend: Backend;

if (process.env.NODE_ENV === 'test' || !Store) {
  const mem: Record<string, any> = {};
  backend = {
    get: (k: string, def?: any) => (mem[k] === undefined ? def : mem[k]),
    set: (k: string, v: any) => { mem[k] = v; },
  };
} else {
  backend = new Store({ name: 'exchanges_cache' });
}

export interface ExchangesCache {
  exchanges: ExchangeRecord[];
  cachedDate: string; // YYYY-MM-DD
}

export const loadCachedExchanges = (): ExchangesCache | null =>
  backend.get('exchangesCache', null);

export const saveCachedExchanges = (exchanges: ExchangeRecord[], date: string): void =>
  backend.set('exchangesCache', { exchanges, cachedDate: date });

/**
 * Stable identity for an exchange.
 *
 * The optimistic record created in `completeExchange` carries a client-generated
 * random `id`, while the persisted row (and its realtime echo) carries a DIFFERENT
 * server-generated id. `exchangeNumber` (EX-...) is generated client-side and
 * persisted verbatim, so it is the only key stable across both — dedup on it,
 * falling back to `id` only when a number is somehow missing.
 */
const exchangeKey = (e: ExchangeRecord): string => e.exchangeNumber || e.id;

/**
 * Merge two sets of exchanges, de-duplicated by stable key. `incoming` wins on
 * conflict (so a server echo reconciles an optimistic record to its server id),
 * result sorted date-descending to match `fetchExchanges`' ordering.
 */
export const mergeExchangesById = (
  existing: ExchangeRecord[],
  incoming: ExchangeRecord[],
): ExchangeRecord[] => {
  const byKey = new Map<string, ExchangeRecord>();
  for (const e of existing) byKey.set(exchangeKey(e), e);
  for (const e of incoming) byKey.set(exchangeKey(e), e); // incoming overwrites
  return Array.from(byKey.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
};

/**
 * Cheap content comparison used to gate state updates and cache writes — avoids
 * a needless re-render when a refresh returns identical data. Compares the set of
 * keys plus a few volatile fields (not a deep equal).
 */
export const exchangesDiffer = (a: ExchangeRecord[], b: ExchangeRecord[]): boolean => {
  if (a.length !== b.length) return true;
  const sig = (list: ExchangeRecord[]) =>
    list
      .map(e => `${exchangeKey(e)}|${e.date}|${e.difference}|${e.newTotal}|${e.returnedTotal}`)
      .sort()
      .join('~');
  return sig(a) !== sig(b);
};

/** Subtract 14 days from a YYYY-MM-DD using local-calendar arithmetic (NOT UTC). */
export const twoWeeksAgoDate = (today: string): string => {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d); // local midnight
  dt.setDate(dt.getDate() - 14);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/**
 * True when the default 2-week cache already covers a report's `from` date, i.e.
 * no older fetch is required. An undefined `from` means an unbounded ("ALL")
 * range, which the cache can never fully cover → false.
 */
export const isRangeWithinCache = (from: string | undefined, cacheFloor: string): boolean => {
  if (!from) return false;
  return from >= cacheFloor;
};

/** Background poll should only run as a fallback while realtime is NOT live. */
export const shouldPoll = (realtimeStatus: string | null): boolean =>
  realtimeStatus !== 'SUBSCRIBED';

export default {
  loadCachedExchanges,
  saveCachedExchanges,
  mergeExchangesById,
  exchangesDiffer,
  twoWeeksAgoDate,
  isRangeWithinCache,
  shouldPoll,
};
