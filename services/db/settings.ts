import { supabase } from '../supabaseClient';
import type { AppSettings } from '../../types';

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

export async function fetchCategories(): Promise<string[]> {
    const { data, error } = await supabase.from('categories').select('name').order('name');
    if (error) throw error;
    return (data ?? []).map(r => r.name);
}

export async function insertCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').insert({ name });
    if (error && error.code !== '23505') throw error;
}

export async function deleteCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('name', name);
    if (error) throw error;
}

export async function fetchBrands(): Promise<string[]> {
    const { data, error } = await supabase.from('brands').select('name').order('name');
    if (error) throw error;
    return (data ?? []).map(r => r.name);
}

export async function insertBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').insert({ name });
    if (error && error.code !== '23505') throw error;
}

export async function deleteBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').delete().eq('name', name);
    if (error) throw error;
}
