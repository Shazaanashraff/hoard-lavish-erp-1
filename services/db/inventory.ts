import { supabase } from '../supabaseClient';
import type { DamagedGood, StockMovement } from '../../types';
import { isUuid, asUuidOrNull } from './shared';
import { upsertBranchStock, insertStockMovement } from './stockMovements';

export async function initializeBranchStock(branchId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    const rows = productIds.map(pid => ({ product_id: pid, branch_id: branchId, quantity: 0 }));
    const { error } = await supabase.from('product_branch_stock').upsert(rows, { onConflict: 'product_id,branch_id' });
    if (error) throw error;
}

export async function fetchDamagedGoods(): Promise<DamagedGood[]> {
    const { data, error } = await supabase
        .from('damaged_goods')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        branchId: r.branch_id ?? undefined,
        branchName: r.branch_name ?? undefined,
        quantity: r.quantity,
        unitPrice: Number(r.unit_price),
        totalLoss: Number(r.total_loss),
        reason: r.reason,
        date: r.date,
    }));
}

export async function insertDamagedGood(record: DamagedGood): Promise<void> {
    const { error } = await supabase.from('damaged_goods').insert({
        ...(record.id && isUuid(record.id) ? { id: record.id } : {}),
        product_id: record.productId,
        product_name: record.productName,
        supplier_id: record.supplierId,
        supplier_name: record.supplierName,
        branch_id: asUuidOrNull(record.branchId ?? undefined),
        branch_name: record.branchName ?? null,
        quantity: record.quantity,
        unit_price: record.unitPrice,
        total_loss: record.totalLoss,
        reason: record.reason,
        date: record.date,
    });
    if (error) throw error;

    const branchId = asUuidOrNull(record.branchId ?? undefined);
    if (branchId) {
        const { data: stockRow, error: stockErr } = await supabase
            .from('product_branch_stock')
            .select('quantity')
            .eq('product_id', record.productId)
            .eq('branch_id', branchId)
            .maybeSingle();
        if (stockErr) throw stockErr;
        const prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
        await upsertBranchStock(record.productId, branchId, prevQty - record.quantity);
        await insertStockMovement({
            id: '',
            productId: record.productId,
            productName: record.productName,
            branchId,
            branchName: record.branchName ?? '',
            type: 'OUT',
            quantity: record.quantity,
            reason: 'Damaged',
            date: record.date,
        } as StockMovement);
    }
}

export async function deleteDamagedGood(id: string): Promise<void> {
    if (!isUuid(id)) return;
    const { data: record, error: fetchErr } = await supabase.from('damaged_goods').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!record) return;

    const branchId = record.branch_id ?? null;
    let prevQty: number | null = null;

    if (branchId) {
        const { data: stockRow, error: stockErr } = await supabase
            .from('product_branch_stock')
            .select('quantity')
            .eq('product_id', record.product_id)
            .eq('branch_id', branchId)
            .maybeSingle();
        if (stockErr) throw stockErr;
        prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
        await upsertBranchStock(record.product_id, branchId, prevQty + record.quantity);
    }

    const { error } = await supabase.from('damaged_goods').delete().eq('id', id);
    if (error) {
        if (branchId && prevQty !== null) {
            try { await upsertBranchStock(record.product_id, branchId, prevQty); } catch (e) {
                throw new Error(`Failed to delete damaged_goods and failed to revert stock: ${String(e)}`);
            }
        }
        throw error;
    }

    if (branchId) {
        await insertStockMovement({
            id: '',
            productId: record.product_id,
            productName: record.product_name,
            branchId,
            branchName: record.branch_name ?? '',
            type: 'IN',
            quantity: record.quantity,
            reason: 'Restock (damaged removed)',
            date: record.date,
        } as StockMovement);
    }
}

export async function deleteDamagedGoodByRecord(record: DamagedGood): Promise<void> {
    let query = supabase
        .from('damaged_goods')
        .select('*')
        .eq('product_id', record.productId)
        .eq('supplier_id', record.supplierId)
        .eq('quantity', record.quantity)
        .eq('unit_price', record.unitPrice)
        .eq('total_loss', record.totalLoss)
        .eq('reason', record.reason)
        .eq('date', record.date);

    if (record.branchId) {
        query = query.eq('branch_id', record.branchId);
    } else {
        query = query.is('branch_id', null);
    }

    const { data: rows, error: selectErr } = await query;
    if (selectErr) throw selectErr;
    if (!rows || rows.length === 0) return;

    for (const row of rows) {
        const bid = row.branch_id ?? null;
        let prevQty: number | null = null;
        if (bid) {
            const { data: stockRow, error: stockErr } = await supabase
                .from('product_branch_stock')
                .select('quantity')
                .eq('product_id', row.product_id)
                .eq('branch_id', bid)
                .maybeSingle();
            if (stockErr) throw stockErr;
            prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
            await upsertBranchStock(row.product_id, bid, prevQty + row.quantity);
        }

        const { error: delErr } = await supabase.from('damaged_goods').delete().eq('id', row.id);
        if (delErr) {
            if (bid && prevQty !== null) {
                try { await upsertBranchStock(row.product_id, bid, prevQty); } catch (e) {
                    throw new Error(`Failed to delete damaged_goods and failed to revert stock: ${String(e)}`);
                }
            }
            throw delErr;
        }

        if (bid) {
            await insertStockMovement({
                id: '',
                productId: row.product_id,
                productName: row.product_name,
                branchId: bid,
                branchName: row.branch_name ?? '',
                type: 'IN',
                quantity: row.quantity,
                reason: 'Restock (damaged removed)',
                date: row.date,
            } as StockMovement);
        }
    }
}
