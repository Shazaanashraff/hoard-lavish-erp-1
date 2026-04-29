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

export async function fetchStockMovements(): Promise<StockMovement[]> {
    const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapStockMovement);
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
