import { supabase } from '../supabaseClient';
import type { StockMovement } from '../../types';

export const mapStockMovement = (r: any): StockMovement => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    branchId: r.branch_id,
    branchName: r.branch_name,
    type: r.type,
    quantity: r.quantity,
    reason: r.reason,
    date: r.date,
});

export interface FetchStockMovementsOptions {
    branchId?: string;
    productId?: string;
    type?: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}

export async function fetchStockMovements(options: FetchStockMovementsOptions = {}): Promise<StockMovement[]> {
    let query = supabase
        .from('stock_movements')
        .select('*')
        .order('date', { ascending: false });
    if (options.branchId) query = query.eq('branch_id', options.branchId);
    if (options.productId) query = query.eq('product_id', options.productId);
    if (options.type) query = query.eq('type', options.type);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapStockMovement);
}

export interface FetchBranchStockOptions {
    branchId?: string;
    productId?: string;
}

export interface BranchStockEntry {
    productId: string;
    branchId: string;
    quantity: number;
}

export async function fetchBranchStock(options: FetchBranchStockOptions = {}): Promise<BranchStockEntry[]> {
    let query = supabase.from('product_branch_stock').select('product_id, branch_id, quantity');
    if (options.branchId) query = query.eq('branch_id', options.branchId);
    if (options.productId) query = query.eq('product_id', options.productId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(r => ({
        productId: r.product_id as string,
        branchId: r.branch_id as string,
        quantity: Number(r.quantity),
    }));
}

export async function insertStockMovement(movement: StockMovement): Promise<void> {
    const { error } = await supabase.from('stock_movements').insert({
        product_id: movement.productId,
        product_name: movement.productName,
        branch_id: movement.branchId,
        branch_name: movement.branchName,
        type: movement.type,
        quantity: movement.quantity,
        reason: movement.reason,
        date: movement.date,
    });
    if (error) throw error;
}

export async function upsertBranchStock(productId: string, branchId: string, quantity: number): Promise<void> {
    const { error } = await supabase.from('product_branch_stock').upsert(
        { product_id: productId, branch_id: branchId, quantity },
        { onConflict: 'product_id,branch_id' }
    );
    if (error) throw error;
}
