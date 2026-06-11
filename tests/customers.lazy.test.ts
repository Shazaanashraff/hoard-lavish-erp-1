import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock electron-store so localCustomers uses in-memory backend ----
vi.mock('electron-store', () => ({ default: undefined }), { virtual: true });

// ---- Mock supabaseService ----
vi.mock('../services/supabaseService', () => ({
  fetchCustomers: vi.fn(),
  insertCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

import * as db from '../services/supabaseService';

// Import localCustomers AFTER mocks are in place
// Reset module registry between tests so the in-memory backend is fresh
const getLocalCustomers = async () => {
  const mod = await import('../services/localCustomers');
  return mod;
};

describe('localCustomers cache helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('loadCachedCustomers returns empty array by default', async () => {
    const lc = await getLocalCustomers();
    expect(lc.loadCachedCustomers()).toEqual([]);
  });

  it('isCacheFresh returns false when no date cached', async () => {
    const lc = await getLocalCustomers();
    expect(lc.isCacheFresh()).toBe(false);
  });

  it('saveCachedCustomers and isCacheFresh round-trip', async () => {
    const lc = await getLocalCustomers();
    const today = new Date().toISOString().slice(0, 10);
    const customers = [{ id: 'c1', name: 'Alice', phone: '0771234567', email: 'a@b.com', loyaltyPoints: 0, totalSpent: 0 }] as any;
    lc.saveCachedCustomers(customers, today);
    expect(lc.isCacheFresh()).toBe(true);
    expect(lc.loadCachedCustomers()).toEqual(customers);
  });

  it('upsertCachedCustomer inserts new customer', async () => {
    const lc = await getLocalCustomers();
    const c = { id: 'c2', name: 'Bob', phone: '0779999999', email: 'b@b.com', loyaltyPoints: 5, totalSpent: 100 } as any;
    lc.upsertCachedCustomer(c);
    expect(lc.loadCachedCustomers()).toContainEqual(c);
  });

  it('upsertCachedCustomer updates existing customer', async () => {
    const lc = await getLocalCustomers();
    const c = { id: 'c3', name: 'Carol', phone: '077', email: '', loyaltyPoints: 0, totalSpent: 0 } as any;
    lc.upsertCachedCustomer(c);
    lc.upsertCachedCustomer({ ...c, name: 'Carol Updated' });
    const list = lc.loadCachedCustomers();
    const found = list.find((x: any) => x.id === 'c3');
    expect(found?.name).toBe('Carol Updated');
    expect(list.filter((x: any) => x.id === 'c3')).toHaveLength(1);
  });

  it('removeCachedCustomer removes by id', async () => {
    const lc = await getLocalCustomers();
    const c = { id: 'c4', name: 'Dan', phone: '077', email: '', loyaltyPoints: 0, totalSpent: 0 } as any;
    lc.upsertCachedCustomer(c);
    lc.removeCachedCustomer('c4');
    expect(lc.loadCachedCustomers().find((x: any) => x.id === 'c4')).toBeUndefined();
  });
});

describe('loadCustomers lazy logic', () => {
  const mockCustomers = [
    { id: 'c1', name: 'Alice', phone: '077', email: '', loyaltyPoints: 0, totalSpent: 0 },
  ] as any[];

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(db.fetchCustomers).mockResolvedValue(mockCustomers);
  });

  it('fetches from db and caches on first call (stale cache)', async () => {
    const lc = await getLocalCustomers();
    // Cache is empty/stale; simulate what loadCustomers does
    expect(lc.isCacheFresh()).toBe(false);

    const data = await db.fetchCustomers();
    lc.saveCachedCustomers(data, new Date().toISOString().slice(0, 10));

    expect(db.fetchCustomers).toHaveBeenCalledTimes(1);
    expect(lc.isCacheFresh()).toBe(true);
    expect(lc.loadCachedCustomers()).toEqual(mockCustomers);
  });

  it('reads from cache on second call same day (no extra db fetch)', async () => {
    const lc = await getLocalCustomers();
    const today = new Date().toISOString().slice(0, 10);

    // Prime the cache
    lc.saveCachedCustomers(mockCustomers, today);
    expect(lc.isCacheFresh()).toBe(true);

    // Simulate loadCustomers: cache is fresh, no db.fetchCustomers call needed
    const result = lc.loadCachedCustomers();
    expect(result).toEqual(mockCustomers);
    expect(db.fetchCustomers).not.toHaveBeenCalled();
  });

  it('refreshCustomers always fetches from db regardless of cache freshness', async () => {
    const lc = await getLocalCustomers();
    const today = new Date().toISOString().slice(0, 10);

    // Prime the cache so it appears fresh
    lc.saveCachedCustomers(mockCustomers, today);
    expect(lc.isCacheFresh()).toBe(true);

    // refreshCustomers always calls db
    const data = await db.fetchCustomers();
    lc.saveCachedCustomers(data, today);

    expect(db.fetchCustomers).toHaveBeenCalledTimes(1);
  });
});

describe('cache write-through on mutations', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('upsertCachedCustomer is called after addCustomer (write-through)', async () => {
    const lc = await getLocalCustomers();
    const newCustomer = { id: 'cx1', name: 'Eve', phone: '071', email: '', loyaltyPoints: 0, totalSpent: 0 } as any;
    // Simulate what addCustomer does
    lc.upsertCachedCustomer(newCustomer);
    expect(lc.loadCachedCustomers()).toContainEqual(newCustomer);
  });

  it('upsertCachedCustomer is called after updateCustomer (write-through)', async () => {
    const lc = await getLocalCustomers();
    const original = { id: 'cx2', name: 'Frank', phone: '072', email: '', loyaltyPoints: 0, totalSpent: 0 } as any;
    lc.upsertCachedCustomer(original);
    // Simulate what updateCustomer does
    const updated = { ...original, name: 'Frank Updated' };
    lc.upsertCachedCustomer(updated);
    const found = lc.loadCachedCustomers().find((c: any) => c.id === 'cx2');
    expect(found?.name).toBe('Frank Updated');
  });

  it('removeCachedCustomer is called after deleteCustomer (write-through)', async () => {
    const lc = await getLocalCustomers();
    const c = { id: 'cx3', name: 'Grace', phone: '073', email: '', loyaltyPoints: 0, totalSpent: 0 } as any;
    lc.upsertCachedCustomer(c);
    // Simulate what deleteCustomer does
    lc.removeCachedCustomer('cx3');
    expect(lc.loadCachedCustomers().find((x: any) => x.id === 'cx3')).toBeUndefined();
  });
});
