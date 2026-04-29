import { supabase } from '../supabaseClient';
import type { StockTransfer } from '../../types';

type SupabaseTableErrorLike = { code?: string; status?: number; message?: string };

let stockTransfersTableAvailable: boolean | null = null;

// Export a function to reset the table availability flag
export function resetStockTransfersTableCache(): void {
    stockTransfersTableAvailable = null;
    console.log('[STOCK TRANSFERS] Table availability cache reset');
}

const isMissingTableError = (error: unknown): boolean => {
    const e = error as SupabaseTableErrorLike | null;
    if (!e) return false;
    if (e.status === 404) return true;
    if (e.code === '42P01' || e.code === 'PGRST205') return true;
    const msg = (e.message || '').toLowerCase();
    return msg.includes('stock_transfers') && (msg.includes('does not exist') || msg.includes('not found'));
};

export async function insertStockTransfer(transfer: StockTransfer): Promise<void> {
    if (stockTransfersTableAvailable === false) {
        console.warn('[STOCK TRANSFERS] Table marked unavailable, skipping insert');
        return;
    }

    const { error } = await supabase.from('stock_transfers').insert({
        transfer_number: transfer.transferNumber,
        date: transfer.date,
        from_branch_id: transfer.fromBranchId,
        from_branch_name: transfer.fromBranchName,
        to_branch_id: transfer.toBranchId,
        to_branch_name: transfer.toBranchName,
        items: transfer.items,
        total_items: transfer.totalItems,
        total_value: transfer.totalValue,
        status: transfer.status,
        notes: transfer.notes,
    });
    if (error) {
        const isMissing = isMissingTableError(error);
        if (isMissing) {
            stockTransfersTableAvailable = false;
            console.error('[STOCK TRANSFERS] Table does not exist (404). Disabling feature. Run database migration if needed.', error);
        }
        throw error;
    }
    stockTransfersTableAvailable = true;
}

export async function fetchStockTransfers(): Promise<StockTransfer[]> {
    if (stockTransfersTableAvailable === false) {
        console.warn('[STOCK TRANSFERS] Table marked unavailable, returning empty array');
        return [];
    }

    const { data, error } = await supabase
        .from('stock_transfers')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        const isMissing = isMissingTableError(error);
        if (isMissing) {
            stockTransfersTableAvailable = false;
            console.error('[STOCK TRANSFERS] Table does not exist (404). Disabling feature. Run database migration if needed.', error);
        }
        throw error;
    }
    stockTransfersTableAvailable = true;

    return (data ?? []).map(r => ({
        id: r.id,
        transferNumber: r.transfer_number,
        date: r.date,
        fromBranchId: r.from_branch_id,
        fromBranchName: r.from_branch_name,
        toBranchId: r.to_branch_id,
        toBranchName: r.to_branch_name,
        items: r.items,
        totalItems: r.total_items,
        totalValue: Number(r.total_value),
        status: r.status,
        notes: r.notes,
    }));
}
