/**
 * TODO-005 completion verification: migrate POS/Accounting/Customers/SalesHistory/Branches
 * to scoped fetchSales, drop fetchSales from loadAll + refreshFromSupabase, remove sales/
 * sale_items from realtime subscription.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

// ── 1. FetchSalesOptions now has customerId, search, offset ──────────────────
describe('FetchSalesOptions shape', () => {
  it('accepts customerId, search, and offset fields', async () => {
    const mod = await import('../services/db/sales');
    type Opts = Parameters<typeof mod.fetchSales>[0];
    const opts: Opts = { branchId: 'b1', customerId: 'c1', search: 'INV-001', offset: 20, limit: 10 };
    expect(opts.customerId).toBe('c1');
    expect(opts.search).toBe('INV-001');
    expect(opts.offset).toBe(20);
  });
});

// ── 2. fetchSales uses .range() ──────────────────────────────────────────────
describe('fetchSales pagination', () => {
  beforeEach(() => vi.resetModules());

  it('uses range(0, 49) for offset=0, limit=50', async () => {
    const rangeMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: rangeMock,
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchSales } = await import('../services/db/sales');
    await fetchSales({ limit: 50, offset: 0 }).catch(() => {});
    expect(rangeMock).toHaveBeenCalledWith(0, 49);
  });

  it('uses range(20, 29) for offset=20, limit=10', async () => {
    const rangeMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: rangeMock,
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchSales } = await import('../services/db/sales');
    await fetchSales({ limit: 10, offset: 20 }).catch(() => {});
    expect(rangeMock).toHaveBeenCalledWith(20, 29);
  });
});

// ── 3. fetchSales search filter ──────────────────────────────────────────────
describe('fetchSales search', () => {
  beforeEach(() => vi.resetModules());

  it('calls .or() when search is provided', async () => {
    const orMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: orMock,
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchSales } = await import('../services/db/sales');
    await fetchSales({ search: 'INV-42' }).catch(() => {});
    expect(orMock).toHaveBeenCalledWith(expect.stringContaining('INV-42'));
  });

  it('does NOT call .or() when search is absent', async () => {
    const orMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: orMock,
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchSales } = await import('../services/db/sales');
    await fetchSales({}).catch(() => {});
    expect(orMock).not.toHaveBeenCalled();
  });
});

// ── 4. StoreContext: fetchSales removed from loadAll + refreshFromSupabase ────
describe('StoreContext does not fetch sales on init', () => {
  it('loadAll Promise.all does not contain db.fetchSales() call', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const calls = lines.filter(l => l.includes('db.fetchSales()'));
    expect(calls.length).toBe(0);
  });

  it('refreshFromSupabase does not contain db.fetchSales() call', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const calls = lines.filter(l => l.includes('db.fetchSales()'));
    expect(calls.length).toBe(0);
  });

  it('realtime subscription does not subscribe to sales table', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const realtimeLines = lines.filter(l => l.includes("table: 'sales'"));
    expect(realtimeLines.length).toBe(0);
  });

  it('realtime subscription does not subscribe to sale_items table', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const realtimeLines = lines.filter(l => l.includes("table: 'sale_items'"));
    expect(realtimeLines.length).toBe(0);
  });
});

// ── 5. StoreContext exposes refreshSalesHistory ───────────────────────────────
describe('StoreContext.refreshSalesHistory', () => {
  it('interface includes refreshSalesHistory', () => {
    const src = readSrc('context/StoreContext.tsx');
    expect(src).toContain('refreshSalesHistory:');
  });
});

// ── 6. Per-component: no salesHistory from useStore ──────────────────────────
const COMPONENTS = [
  ['components/POS/index.tsx', 'POS'],
  ['components/Accounting.tsx', 'Accounting'],
  ['components/Customers.tsx', 'Customers'],
  ['components/SalesHistory.tsx', 'SalesHistory'],
  ['components/Branches.tsx', 'Branches'],
];

describe('Five components do not use global salesHistory', () => {
  COMPONENTS.forEach(([path, name]) => {
    it(`${name}: does not destructure salesHistory from useStore()`, () => {
      const src = readSrc(path);
      const destructureLine = src.match(/const \{[^}]+\} = useStore\(\)/)?.[0] ?? '';
      expect(destructureLine).not.toContain('salesHistory');
    });

    it(`${name}: imports fetchSales directly`, () => {
      const src = readSrc(path);
      expect(src).toContain('fetchSales');
    });
  });
});
