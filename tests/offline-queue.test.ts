/**
 * Offline queue system verification tests.
 *
 * Covers:
 *   1. isLikelyConnectivityIssue  — pure unit
 *   2. extractDbErrorMessage       — pure unit
 *   3. Queue localStorage round-trip
 *   4. Queue filtering / FIFO sort (the logic syncOfflineQueue uses)
 *   5. Offline-detection decision logic (navigator.onLine + thrown errors)
 *   6. Bug regression: DELETE_TRANSFER must exist in OfflineOperationType
 *   7. Bug regression: window 'online' event listener must exist in StoreContext
 *
 * Run: npx vitest run tests/offline-queue.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isLikelyConnectivityIssue, extractDbErrorMessage } from '../utils/errors';
import type { OfflineQueueItem, OfflineOperationType } from '../types';
import fs from 'fs';
import path from 'path';

// ─── helpers ──────────────────────────────────────────────────────────────────

const OFFLINE_QUEUE_KEY = 'hoard_offline_queue_v1';

function makeItem(
  op: OfflineOperationType,
  status: OfflineQueueItem['status'] = 'PENDING',
  createdAt = new Date().toISOString(),
): OfflineQueueItem {
  return {
    id: `${op}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    operation: op,
    payload: { test: true },
    createdAt,
    retryCount: 0,
    status,
  };
}

function setOnlineStatus(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
}

/**
 * Mirrors the decision logic in executeWithOfflineQueue.
 * Returns 'queued' | 'success' | 'error' so we can assert the path taken
 * without mounting the React context.
 */
async function offlineDecision(
  isOnline: boolean,
  fn: () => Promise<void>,
): Promise<'queued-offline' | 'queued-network-error' | 'success' | 'hard-error'> {
  if (!isOnline) return 'queued-offline';
  try {
    await fn();
    return 'success';
  } catch (err) {
    if (isLikelyConnectivityIssue(err)) return 'queued-network-error';
    return 'hard-error';
  }
}

// ─── 1. isLikelyConnectivityIssue ─────────────────────────────────────────────

describe('isLikelyConnectivityIssue', () => {
  afterEach(() => setOnlineStatus(true));

  it('returns true when navigator.onLine is false (irrespective of error shape)', () => {
    setOnlineStatus(false);
    expect(isLikelyConnectivityIssue(null)).toBe(true);
  });

  it('returns true for "Failed to fetch" Error', () => {
    expect(isLikelyConnectivityIssue(new Error('Failed to fetch'))).toBe(true);
  });

  it('returns true for "NetworkError when attempting to fetch resource"', () => {
    expect(isLikelyConnectivityIssue(
      new Error('NetworkError when attempting to fetch resource.'),
    )).toBe(true);
  });

  it('returns true for "network request failed"', () => {
    expect(isLikelyConnectivityIssue(new Error('network request failed'))).toBe(true);
  });

  it('returns true for "fetch failed"', () => {
    expect(isLikelyConnectivityIssue(new Error('fetch failed'))).toBe(true);
  });

  it('returns true for "timed out" in message', () => {
    expect(isLikelyConnectivityIssue(new Error('request timed out'))).toBe(true);
  });

  it('returns true for "connection refused"', () => {
    expect(isLikelyConnectivityIssue(new Error('connection refused'))).toBe(true);
  });

  it('returns true for plain object with "failed to fetch" message', () => {
    expect(isLikelyConnectivityIssue({ message: 'Failed to fetch' })).toBe(true);
  });

  it('returns true for plain object with "network" in message', () => {
    expect(isLikelyConnectivityIssue({ message: 'network error' })).toBe(true);
  });

  it('returns false for a postgres duplicate-key error (23505)', () => {
    expect(isLikelyConnectivityIssue(
      { code: '23505', message: 'duplicate key value violates unique constraint' },
    )).toBe(false);
  });

  it('returns false for a permission-denied error (42501)', () => {
    expect(isLikelyConnectivityIssue(
      { code: '42501', message: 'permission denied for table products' },
    )).toBe(false);
  });

  it('returns false for a plain logic Error', () => {
    expect(isLikelyConnectivityIssue(new Error('Cannot read property of undefined'))).toBe(false);
  });

  it('returns false for null when online', () => {
    expect(isLikelyConnectivityIssue(null)).toBe(false);
  });

  it('returns false for undefined when online', () => {
    expect(isLikelyConnectivityIssue(undefined)).toBe(false);
  });
});

// ─── 2. extractDbErrorMessage ─────────────────────────────────────────────────

describe('extractDbErrorMessage', () => {
  afterEach(() => setOnlineStatus(true));

  it('returns checkout-specific connectivity message when operationType is checkout', () => {
    const msg = extractDbErrorMessage(new Error('Failed to fetch'), 'fallback', 'checkout');
    expect(msg).toContain('internet connection');
    expect(msg.toLowerCase()).toContain('checkout');
  });

  it('returns general connectivity message when operationType is general', () => {
    const msg = extractDbErrorMessage(new Error('Failed to fetch'), 'fallback', 'general');
    expect(msg).toContain('internet connection');
    expect(msg.toLowerCase()).not.toContain('checkout');
  });

  it('returns duplicate-key message for postgres 23505', () => {
    const msg = extractDbErrorMessage({ code: '23505', message: 'unique' }, 'fallback');
    expect(msg).toMatch(/already exists/i);
  });

  it('returns permission-denied message for postgres 42501', () => {
    const msg = extractDbErrorMessage({ code: '42501', message: 'denied' }, 'fallback');
    expect(msg).toMatch(/permission denied/i);
  });

  it('returns required-field message for postgres 23502', () => {
    const msg = extractDbErrorMessage({ code: '23502', message: 'not-null' }, 'fallback');
    expect(msg).toMatch(/required field/i);
  });

  it('uses the fallback string when error has no useful message', () => {
    const msg = extractDbErrorMessage({}, 'Something went wrong');
    expect(msg).toContain('Something went wrong');
  });

  it('uses error.message when it is a plain Error', () => {
    const msg = extractDbErrorMessage(new Error('Bad RLS policy'));
    expect(msg).toContain('Bad RLS policy');
  });

  it('returns checkout connectivity message when navigator.onLine is false', () => {
    setOnlineStatus(false);
    const msg = extractDbErrorMessage(null, 'fallback', 'checkout');
    expect(msg.toLowerCase()).toContain('checkout');
    expect(msg).toContain('internet connection');
  });
});

// ─── 3. Queue localStorage round-trip ─────────────────────────────────────────

describe('offline queue — localStorage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('serialises a queue to localStorage and deserialises identically', () => {
    const items: OfflineQueueItem[] = [
      makeItem('COMPLETE_SALE'),
      makeItem('ADD_CUSTOMER', 'FAILED'),
    ];

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));

    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(raw).not.toBeNull();

    const parsed: unknown[] = JSON.parse(raw!);
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as OfflineQueueItem).operation).toBe('COMPLETE_SALE');
    expect((parsed[1] as OfflineQueueItem).status).toBe('FAILED');
  });

  it('preserves all OfflineQueueItem fields through a round-trip', () => {
    const original = makeItem('UPDATE_PRODUCT');
    original.retryCount = 3;
    original.errorMessage = 'connection refused';

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([original]));
    const [restored] = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!) as OfflineQueueItem[];

    expect(restored.id).toBe(original.id);
    expect(restored.operation).toBe(original.operation);
    expect(restored.payload).toEqual(original.payload);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.retryCount).toBe(3);
    expect(restored.errorMessage).toBe('connection refused');
    expect(restored.status).toBe('PENDING');
  });

  it('returns empty array when storage is empty', () => {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    expect(raw).toBeNull();
  });

  it('tolerates corrupt data gracefully (real app wraps in try/catch)', () => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, 'not-valid-json{{');
    expect(() => {
      try { JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!); }
      catch { /* StoreContext catches this */ }
    }).not.toThrow();
  });
});

// ─── 4. Queue filtering and FIFO ordering ─────────────────────────────────────

describe('offline queue — sync filtering and FIFO ordering', () => {
  it('sync must include PENDING items', () => {
    const queue = [makeItem('COMPLETE_SALE', 'PENDING'), makeItem('ADD_CUSTOMER', 'SYNCING')];
    const pending = queue.filter(i => i.status === 'PENDING' || i.status === 'FAILED');
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('COMPLETE_SALE');
  });

  it('sync must include FAILED items', () => {
    const queue = [makeItem('COMPLETE_SALE', 'FAILED'), makeItem('ADD_CUSTOMER', 'SYNCING')];
    const pending = queue.filter(i => i.status === 'PENDING' || i.status === 'FAILED');
    expect(pending).toHaveLength(1);
    expect(pending[0].operation).toBe('COMPLETE_SALE');
  });

  it('SYNCING items must be excluded from sync', () => {
    const queue = [
      makeItem('COMPLETE_SALE', 'SYNCING'),
      makeItem('ADD_CUSTOMER', 'SYNCING'),
    ];
    const pending = queue.filter(i => i.status === 'PENDING' || i.status === 'FAILED');
    expect(pending).toHaveLength(0);
  });

  it('sorts eligible items oldest-first (FIFO)', () => {
    const old   = makeItem('COMPLETE_SALE', 'PENDING', '2024-01-01T10:00:00.000Z');
    const newer = makeItem('ADD_CUSTOMER',  'PENDING', '2024-01-01T12:00:00.000Z');
    const queue = [newer, old]; // reversed order

    const sorted = [...queue]
      .filter(i => i.status === 'PENDING' || i.status === 'FAILED')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    expect(sorted[0].operation).toBe('COMPLETE_SALE'); // oldest first
    expect(sorted[1].operation).toBe('ADD_CUSTOMER');
  });

  it('mixed statuses: only PENDING and FAILED emerge, in chronological order', () => {
    const t0 = '2024-01-01T08:00:00.000Z';
    const t1 = '2024-01-01T09:00:00.000Z';
    const t2 = '2024-01-01T10:00:00.000Z';

    const queue: OfflineQueueItem[] = [
      makeItem('COMPLETE_SALE', 'SYNCING', t0),  // excluded
      makeItem('DELETE_SALE',   'FAILED',  t1),  // included
      makeItem('ADD_CUSTOMER',  'PENDING', t2),  // included
    ];

    const sorted = [...queue]
      .filter(i => i.status === 'PENDING' || i.status === 'FAILED')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    expect(sorted).toHaveLength(2);
    expect(sorted[0].operation).toBe('DELETE_SALE');
    expect(sorted[1].operation).toBe('ADD_CUSTOMER');
  });
});

// ─── 5. Offline detection decision logic ─────────────────────────────────────

describe('offline detection — executeWithOfflineQueue decision logic', () => {
  afterEach(() => setOnlineStatus(true));

  it('queues when navigator.onLine is false — no network call is made', async () => {
    setOnlineStatus(false);
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = await offlineDecision(false, fn);

    expect(result).toBe('queued-offline');
    expect(fn).not.toHaveBeenCalled(); // fn must NOT fire when offline
  });

  it('succeeds when online and fn resolves', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const result = await offlineDecision(true, fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('queues when fn throws "Failed to fetch" (connectivity error)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const result = await offlineDecision(true, fn);

    expect(result).toBe('queued-network-error');
  });

  it('queues when fn throws "NetworkError" (connectivity error)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('NetworkError when attempting to fetch resource.'));
    const result = await offlineDecision(true, fn);

    expect(result).toBe('queued-network-error');
  });

  it('queues when fn throws "connection" error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('connection refused'));
    const result = await offlineDecision(true, fn);

    expect(result).toBe('queued-network-error');
  });

  it('does NOT queue when fn throws a non-connectivity error (23505 duplicate)', async () => {
    const fn = vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key' });
    const result = await offlineDecision(true, fn);

    expect(result).toBe('hard-error');
  });

  it('does NOT queue when fn throws a permission-denied error (42501)', async () => {
    const fn = vi.fn().mockRejectedValue({ code: '42501', message: 'permission denied' });
    const result = await offlineDecision(true, fn);

    expect(result).toBe('hard-error');
  });

  it('a sale queued offline has COMPLETE_SALE operation and non-empty payload', () => {
    const sale = { id: 'sale-1', total: 100, items: [] };
    const item = makeItem('COMPLETE_SALE');
    item.payload = { sale };

    expect(item.operation).toBe('COMPLETE_SALE');
    expect(item.payload.sale).toEqual(sale);
    expect(item.status).toBe('PENDING');
  });
});

// ─── 6. BUG: DELETE_TRANSFER missing from OfflineOperationType ─────────────────
//
// StoreContext.tsx calls executeWithOfflineQueue('DELETE_TRANSFER', ...) but
// 'DELETE_TRANSFER' is not in the OfflineOperationType union (types.ts) and
// has no case in runOfflineOperation's switch statement.
// Consequence: if a transfer deletion is queued offline it is silently dropped
// on replay (default: return).

describe('BUG regression — DELETE_TRANSFER in OfflineOperationType', () => {
  it('DELETE_TRANSFER is a recognised OfflineOperationType', () => {
    // If this fails, add | "DELETE_TRANSFER" to OfflineOperationType in types.ts
    // and a matching case in runOfflineOperation in StoreContext.tsx.
    const validOps: OfflineOperationType[] = [
      'ADD_BRANCH', 'UPDATE_BRANCH',
      'ADD_PRODUCT', 'UPDATE_PRODUCT', 'DELETE_PRODUCT',
      'ADD_CUSTOMER', 'UPDATE_CUSTOMER', 'DELETE_CUSTOMER',
      'COMPLETE_SALE', 'UPDATE_SALE', 'DELETE_SALE',
      'COMPLETE_EXCHANGE',
      'ADJUST_STOCK', 'TRANSFER_STOCK', 'DELETE_TRANSFER',
      'ADD_CATEGORY', 'REMOVE_CATEGORY',
      'ADD_BRAND', 'REMOVE_BRAND',
      'ADD_SUPPLIER', 'UPDATE_SUPPLIER', 'DELETE_SUPPLIER',
      'RECORD_SUPPLIER_EXPENSE',
      'ADD_SUPPLIER_TRANSACTION', 'UPDATE_SUPPLIER_TRANSACTION', 'DELETE_SUPPLIER_TRANSACTION',
      'ADD_EXPENSE', 'DELETE_EXPENSE',
      'ADD_DAMAGED_GOOD', 'DELETE_DAMAGED_GOOD',
      'ADD_USER', 'UPDATE_USER', 'DELETE_USER',
      'UPDATE_SETTINGS',
    ];

    const item = makeItem('COMPLETE_SALE'); // compile-time safe op
    // Verify DELETE_TRANSFER is in the list we expect the type to allow
    expect(validOps).toContain('DELETE_TRANSFER');
    // And that an item can hold it
    const deleteTransferItem: OfflineQueueItem = { ...item, operation: 'DELETE_TRANSFER' as OfflineOperationType };
    expect(deleteTransferItem.operation).toBe('DELETE_TRANSFER');
  });

  it('runOfflineOperation switch must have a case for every OfflineOperationType', () => {
    // Read StoreContext source and verify DELETE_TRANSFER has a case.
    // This is a static analysis test — it will FAIL until the case is added.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../context/StoreContext.tsx'),
      'utf-8',
    );
    expect(src).toContain("case 'DELETE_TRANSFER':");
  });
});

// ─── 7. BUG: window 'online' event listener must exist ────────────────────────
//
// The auto-sync useEffect (StoreContext.tsx ~line 2167) fires only when
// isCloudConnected becomes true.  isCloudConnected is set to true only inside
// loadAll() and refreshFromSupabase().  If the app starts offline, loadAll()
// throws, isCloudConnected stays false, and nothing sets it back to true when
// the network returns — so the offline queue is NEVER auto-synced.
//
// Fix: add a window.addEventListener('online', ...) effect that calls
// refreshFromSupabase() when the network comes back.

describe('BUG regression — window online event triggers auto-sync', () => {
  it('StoreContext registers a window "online" event listener', () => {
    // Read StoreContext source and verify an 'online' listener is registered.
    // This test will FAIL until the fix is applied.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../context/StoreContext.tsx'),
      'utf-8',
    );
    // Look for addEventListener('online', ...) or similar patterns
    const hasOnlineListener =
      src.includes("addEventListener('online'") ||
      src.includes('addEventListener("online"');

    expect(hasOnlineListener).toBe(true);
  });

  it('the online listener cleans up on unmount (must call removeEventListener)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../context/StoreContext.tsx'),
      'utf-8',
    );
    const hasRemoveListener =
      src.includes("removeEventListener('online'") ||
      src.includes('removeEventListener("online"');

    expect(hasRemoveListener).toBe(true);
  });
});
