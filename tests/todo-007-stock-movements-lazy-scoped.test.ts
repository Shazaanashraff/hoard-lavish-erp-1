/**
 * TODO-007 completion verification: stock_movements lazy scoped fetch.
 * These tests verify the structural contracts without needing a real Supabase connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

// ── 1. FetchStockMovementsOptions has offset + excludeSaleOuts ───────────────
describe('FetchStockMovementsOptions shape', () => {
  it('accepts offset and excludeSaleOuts fields', async () => {
    const mod = await import('../services/db/stockMovements');
    type Opts = Parameters<typeof mod.fetchStockMovements>[0];
    const opts: Opts = { branchId: 'b1', limit: 20, offset: 40, excludeSaleOuts: true };
    expect(opts.offset).toBe(40);
    expect(opts.excludeSaleOuts).toBe(true);
  });
});

// ── 2. fetchStockMovements calls .range() with correct bounds ────────────────
describe('fetchStockMovements pagination', () => {
  beforeEach(() => vi.resetModules());

  it('uses range(0, 49) for first page with limit=50', async () => {
    const rangeMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: rangeMock,
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchStockMovements } = await import('../services/db/stockMovements');
    await fetchStockMovements({ limit: 50, offset: 0 }).catch(() => {});
    expect(rangeMock).toHaveBeenCalledWith(0, 49);
  });

  it('uses range(50, 99) for second page with limit=50, offset=50', async () => {
    const rangeMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: rangeMock,
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchStockMovements } = await import('../services/db/stockMovements');
    await fetchStockMovements({ limit: 50, offset: 50 }).catch(() => {});
    expect(rangeMock).toHaveBeenCalledWith(50, 99);
  });
});

// ── 3. excludeSaleOuts calls .not('reason', 'like', 'Sale%') ────────────────
describe('fetchStockMovements excludeSaleOuts', () => {
  beforeEach(() => vi.resetModules());

  it('adds .not filter when excludeSaleOuts=true', async () => {
    const notMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: notMock,
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchStockMovements } = await import('../services/db/stockMovements');
    await fetchStockMovements({ excludeSaleOuts: true }).catch(() => {});
    expect(notMock).toHaveBeenCalledWith('reason', 'like', 'Sale%');
  });

  it('does NOT add .not filter when excludeSaleOuts is absent', async () => {
    const notMock = vi.fn().mockReturnThis();
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: notMock,
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
    };
    vi.doMock('../services/supabaseClient', () => ({ supabase: supabaseMock }));
    const { fetchStockMovements } = await import('../services/db/stockMovements');
    await fetchStockMovements({}).catch(() => {});
    expect(notMock).not.toHaveBeenCalled();
  });
});

// ── 4. adjustStock return type ───────────────────────────────────────────────
describe('adjustStock return type', () => {
  it('StoreContextType.adjustStock is typed to return StockMovement | null', () => {
    const src = readSrc('context/StoreContext.tsx');
    expect(src).toContain('adjustStock: (productId: string, quantity: number, type:');
    expect(src).toContain('StockMovement | null');
  });
});

// ── 5. stock_movements removed from loadAll and refreshFromSupabase ──────────
describe('StoreContext does not fetch stockMovements on init', () => {
  it('loadAll Promise.all does not contain fetchStockMovements call', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const calls = lines.filter(l => l.includes('db.fetchStockMovements()'));
    expect(calls.length).toBe(0);
  });

  it('realtime subscription does not subscribe to stock_movements table', () => {
    const src = readSrc('context/StoreContext.tsx');
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const realtimeLines = lines.filter(l => l.includes("table: 'stock_movements'"));
    expect(realtimeLines.length).toBe(0);
  });
});

// ── 6. Inventory removes stockHistory from useStore ─────────────────────────
describe('Inventory component', () => {
  it('does not destructure stockHistory from useStore', () => {
    const src = readSrc('components/Inventory/index.tsx');
    const destructureLine = src.match(/const \{[^}]+\} = useStore\(\)/)?.[0] ?? '';
    expect(destructureLine).not.toContain('stockHistory');
  });

  it('imports fetchStockMovements directly', () => {
    const src = readSrc('components/Inventory/index.tsx');
    expect(src).toContain("import { fetchStockMovements }");
  });
});

// ── 7. Dashboard removes stockHistory from useStore ─────────────────────────
describe('Dashboard component', () => {
  it('does not destructure stockHistory from useStore', () => {
    const src = readSrc('components/Dashboard/index.tsx');
    const destructureLine = src.match(/const \{[^}]+\} = useStore\(\)/)?.[0] ?? '';
    expect(destructureLine).not.toContain('stockHistory');
  });

  it('imports fetchStockMovements directly', () => {
    const src = readSrc('components/Dashboard/index.tsx');
    expect(src).toContain("import { fetchStockMovements }");
  });
});
