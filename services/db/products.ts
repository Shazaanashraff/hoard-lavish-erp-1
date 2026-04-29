import { supabase } from '../supabaseClient';
import type { Product, Branch } from '../../types';
import { isUuid } from './shared';

export const mapProduct = (r: any, branchStock: Record<string, number> = {}): Product => ({
    id: r.id,
    name: r.name,
    category: r.category,
    brand: r.brand,
    price: Number(r.price),
    costPrice: Number(r.cost_price),
    stock: Object.values(branchStock).reduce((a, b) => a + b, 0),
    branchStock,
    minStockLevel: r.min_stock_level,
    sku: r.sku,
    description: r.description,
    imageUrl: r.image_url ?? undefined,
    color: r.color ?? '',
    size: r.size ?? '',
    barcode: r.barcode ?? '',
    barcode2: r.barcode2 ?? '',
});

export async function fetchProductsWithStock(): Promise<Product[]> {
    const [productsRes, stockRes] = await Promise.all([
        supabase
            .from('products')
            .select('id, name, category, brand, price, cost_price, min_stock_level, sku, description, image_url, color, size, barcode, barcode2, created_at')
            .order('created_at'),
        supabase
            .from('product_branch_stock')
            .select('product_id, branch_id, quantity'),
    ]);
    if (productsRes.error) throw productsRes.error;
    if (stockRes.error) throw stockRes.error;

    const stockMap: Record<string, Record<string, number>> = {};
    for (const row of (stockRes.data ?? [])) {
        if (!stockMap[row.product_id]) stockMap[row.product_id] = {};
        stockMap[row.product_id][row.branch_id] = row.quantity;
    }

    return (productsRes.data ?? []).map(r => mapProduct(r, stockMap[r.id] || {}));
}

export async function insertProduct(product: Product, branches: Branch[]): Promise<Product> {
    const { data, error } = await supabase.from('products').insert({
        ...(product.id && isUuid(product.id) ? { id: product.id } : {}),
        name: product.name,
        category: product.category,
        brand: product.brand,
        price: product.price,
        cost_price: product.costPrice,
        min_stock_level: product.minStockLevel,
        sku: product.sku,
        description: product.description,
        image_url: product.imageUrl ?? null,
        color: product.color ?? '',
        size: product.size ?? '',
        barcode: product.barcode ?? '',
        barcode2: product.barcode2 ?? '',
    }).select('id').single();
    if (error) throw error;

    const stockRows = branches.map(b => ({
        product_id: data.id,
        branch_id: b.id,
        quantity: product.branchStock[b.id] ?? 0,
    }));
    if (stockRows.length > 0) {
        const { error: stockError } = await supabase.from('product_branch_stock').insert(stockRows);
        if (stockError) {
            await supabase.from('products').delete().eq('id', data.id);
            throw stockError;
        }
    }

    return { ...product, id: data.id };
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
    if (updates.minStockLevel !== undefined) dbUpdates.min_stock_level = updates.minStockLevel;
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.size !== undefined) dbUpdates.size = updates.size;
    if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
    if (updates.barcode2 !== undefined) dbUpdates.barcode2 = updates.barcode2;

    if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
        if (error) throw error;
    }

    if (updates.branchStock) {
        for (const [branchId, qty] of Object.entries(updates.branchStock)) {
            const { error } = await supabase.from('product_branch_stock').upsert(
                { product_id: id, branch_id: branchId, quantity: qty },
                { onConflict: 'product_id,branch_id' }
            );
            if (error) throw error;
        }
    }
}

export type ProductDeleteMode = 'BLOCK_IF_LINKED' | 'KEEP_SALES_SNAPSHOT' | 'DELETE_LINKED_SALES';

async function getLinkedSaleIds(productId: string): Promise<string[]> {
    const { data, error } = await supabase.from('sale_items').select('sale_id').eq('product_id', productId);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map(r => r.sale_id).filter(Boolean)));
}

export async function getProductLinkedSalesCount(productId: string): Promise<number> {
    return (await getLinkedSaleIds(productId)).length;
}

export async function deleteProduct(id: string, mode: ProductDeleteMode = 'BLOCK_IF_LINKED'): Promise<void> {
    const linkedSaleIds = await getLinkedSaleIds(id);

    if (linkedSaleIds.length > 0 && mode === 'BLOCK_IF_LINKED') {
        throw new Error('Cannot delete this product because it is linked to sales history.');
    }

    if (linkedSaleIds.length > 0 && mode === 'KEEP_SALES_SNAPSHOT') {
        const { error: unlinkError } = await supabase.from('sale_items').update({ product_id: null }).eq('product_id', id);
        if (unlinkError) {
            if ((unlinkError as { code?: string }).code === '23502') {
                throw new Error('Database migration required: sale_items.product_id must allow NULL before unlink-delete can work.');
            }
            throw unlinkError;
        }
    }

    if (linkedSaleIds.length > 0 && mode === 'DELETE_LINKED_SALES') {
        const { error: deleteSalesError } = await supabase.from('sales').delete().in('id', linkedSaleIds);
        if (deleteSalesError) throw deleteSalesError;
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}
