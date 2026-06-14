import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSalesDailyTotals, fetchSales } from './sales';

vi.mock('../supabaseClient', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

import { supabase } from '../supabaseClient';

// Mock RPC rows: 4 sales spread across 2 days and 2 branches
const BRANCH_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRANCH_B = 'bbbbbbbb-0000-0000-0000-000000000002';

// Raw DB rows returned by fn_sales_daily_totals
const mockRpcRows = [
    { date: '2024-03-01', branch_id: BRANCH_A, sum_amount: '350.00', sum_cost: '150.00', tx_count: 2 },
    { date: '2024-03-01', branch_id: BRANCH_B, sum_amount: '200.00', sum_cost: '90.00',  tx_count: 1 },
    { date: '2024-03-02', branch_id: BRANCH_A, sum_amount: '400.00', sum_cost: '180.00', tx_count: 1 },
];

describe('fetchSalesDailyTotals', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('wrapper parity — numeric mapping', () => {
        it('maps RPC rows to camelCase SalesDailyTotal objects with correct numeric values', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockRpcRows, error: null });

            const results = await fetchSalesDailyTotals({
                dateFrom: '2024-03-01',
                dateTo: '2024-03-02',
            });

            expect(results).toHaveLength(3);

            // Verify by summing mock rows to confirm parity (not hard-coded expected values)
            const totalAmount = mockRpcRows.reduce((sum, r) => sum + Number(r.sum_amount), 0);
            const totalCost   = mockRpcRows.reduce((sum, r) => sum + Number(r.sum_cost),   0);
            const totalTx     = mockRpcRows.reduce((sum, r) => sum + Number(r.tx_count),    0);

            const resultTotalAmount = results.reduce((sum, r) => sum + r.sumAmount, 0);
            const resultTotalCost   = results.reduce((sum, r) => sum + r.sumCost,   0);
            const resultTotalTx     = results.reduce((sum, r) => sum + r.txCount,   0);

            expect(resultTotalAmount).toBeCloseTo(totalAmount, 2);
            expect(resultTotalCost).toBeCloseTo(totalCost, 2);
            expect(resultTotalTx).toBe(totalTx);
        });

        it('coerces numeric string fields from the DB to JS numbers', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: [{ date: '2024-03-01', branch_id: BRANCH_A, sum_amount: '999.99', sum_cost: '499.50', tx_count: 5 }],
                error: null,
            });

            const [row] = await fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-01' });
            expect(typeof row.sumAmount).toBe('number');
            expect(typeof row.sumCost).toBe('number');
            expect(typeof row.txCount).toBe('number');
            expect(row.sumAmount).toBeCloseTo(999.99, 2);
            expect(row.sumCost).toBeCloseTo(499.50, 2);
            expect(row.txCount).toBe(5);
        });
    });

    describe('args & shape', () => {
        it('calls supabase.rpc with fn_sales_daily_totals and null p_branch_id when branchId is omitted', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });

            await fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-31' });

            expect(supabase.rpc).toHaveBeenCalledWith('fn_sales_daily_totals', {
                p_branch_id: null,
                p_date_from: '2024-03-01',
                p_date_to: '2024-03-31',
            });
        });

        it('calls supabase.rpc with the provided branchId UUID as p_branch_id', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });

            await fetchSalesDailyTotals({ branchId: BRANCH_A, dateFrom: '2024-03-01', dateTo: '2024-03-31' });

            expect(supabase.rpc).toHaveBeenCalledWith('fn_sales_daily_totals', {
                p_branch_id: BRANCH_A,
                p_date_from: '2024-03-01',
                p_date_to: '2024-03-31',
            });
        });

        it('returns camelCase shape with all expected fields', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
                data: [{ date: '2024-03-01', branch_id: BRANCH_A, sum_amount: '100', sum_cost: '50', tx_count: 1 }],
                error: null,
            });

            const [row] = await fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-01' });

            expect(row).toMatchObject({
                date: '2024-03-01',
                branchId: BRANCH_A,
                sumAmount: 100,
                sumCost: 50,
                txCount: 1,
            });
        });

        it('returns an empty array (not throw) when RPC returns no rows', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });

            const results = await fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-01' });
            expect(results).toEqual([]);
        });

        it('returns an empty array when RPC returns null data', async () => {
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

            const results = await fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-01' });
            expect(results).toEqual([]);
        });

        it('throws when RPC returns an error', async () => {
            const mockError = new Error('RPC failed');
            (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: mockError });

            await expect(
                fetchSalesDailyTotals({ dateFrom: '2024-03-01', dateTo: '2024-03-01' })
            ).rejects.toThrow('RPC failed');
        });
    });

    describe('regression guard — fetchSales unchanged', () => {
        it('fetchSales calls .from(sales).select(...) with the sale_items join column string', async () => {
            const mockSelect = vi.fn().mockReturnThis();
            const mockOrder  = vi.fn().mockReturnThis();
            const mockEq     = vi.fn().mockReturnThis();
            const mockGte    = vi.fn().mockReturnThis();
            const mockLte    = vi.fn().mockReturnThis();
            const mockLimit  = vi.fn().mockResolvedValue({ data: [], error: null });

            (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
                select: mockSelect,
                order:  mockOrder,
                eq:     mockEq,
                gte:    mockGte,
                lte:    mockLte,
                limit:  mockLimit,
            });

            // Make the chain resolve
            mockOrder.mockResolvedValue({ data: [], error: null });

            await fetchSales({});

            expect(supabase.from).toHaveBeenCalledWith('sales');
            expect(mockSelect).toHaveBeenCalledWith(
                '*, sale_items(*, products(id, name, sku, size, color, barcode, barcode2))'
            );
        });
    });
});
