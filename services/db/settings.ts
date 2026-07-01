import { supabase } from '../supabaseClient';
import type { AppSettings, CategoryRecord, BrandRecord } from '../../types';

export const mapSettings = (r: any): AppSettings => ({
    storeName: r.store_name,
    currencySymbol: r.currency_symbol,
    taxRate: Number(r.tax_rate),
    enableLowStockAlerts: r.enable_low_stock_alerts,
});

export async function fetchSettings(): Promise<AppSettings> {
    const { data, error } = await supabase.from('app_settings').select('*').limit(1).single();
    if (error) throw error;
    return mapSettings(data);
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.storeName !== undefined) dbUpdates.store_name = updates.storeName;
    if (updates.currencySymbol !== undefined) dbUpdates.currency_symbol = updates.currencySymbol;
    if (updates.taxRate !== undefined) dbUpdates.tax_rate = updates.taxRate;
    if (updates.enableLowStockAlerts !== undefined) dbUpdates.enable_low_stock_alerts = updates.enableLowStockAlerts;

    const { data: existing, error: fetchError } = await supabase.from('app_settings').select('id').limit(1).single();
    if (fetchError) throw fetchError;

    const { error } = await supabase.from('app_settings').update(dbUpdates).eq('id', existing.id);
    if (error) throw error;
}

const mapCategoryRow = (r: any): CategoryRecord => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
});

const mapBrandRow = (r: any): BrandRecord => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
});

export async function fetchCategories(opts?: { since?: string }): Promise<CategoryRecord[]> {
    let query = supabase.from('categories').select('id, name, updated_at, deleted_at');
    if (opts?.since) query = query.gt('updated_at', opts.since);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapCategoryRow);
}

export async function insertCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').insert({ name });
    if (error && error.code !== '23505') throw error;
}

export async function updateCategory(oldName: string, newName: string): Promise<CategoryRecord> {
    const { data, error } = await supabase.rpc('fn_rename_category', { p_old_name: oldName, p_new_name: newName }).single();
    if (error) throw error;
    return mapCategoryRow(data);
}

export async function deleteCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').update({ deleted_at: new Date().toISOString() }).eq('name', name);
    if (error) throw error;
}

export async function fetchBrands(opts?: { since?: string }): Promise<BrandRecord[]> {
    let query = supabase.from('brands').select('id, name, updated_at, deleted_at');
    if (opts?.since) query = query.gt('updated_at', opts.since);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapBrandRow);
}

export async function insertBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').insert({ name });
    if (error && error.code !== '23505') throw error;
}

export async function updateBrand(oldName: string, newName: string): Promise<BrandRecord> {
    const { data, error } = await supabase.rpc('fn_rename_brand', { p_old_name: oldName, p_new_name: newName }).single();
    if (error) throw error;
    return mapBrandRow(data);
}

export async function deleteBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').update({ deleted_at: new Date().toISOString() }).eq('name', name);
    if (error) throw error;
}
