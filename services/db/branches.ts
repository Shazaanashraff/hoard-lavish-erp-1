import { supabase } from '../supabaseClient';
import type { Branch } from '../../types';
import { normalizeBranchName, MOUNT_LAVINIA_DEFAULT_PRINTER } from '../../utils/branch';

const getDefaultThermalPrinter = (name?: string): string =>
    normalizeBranchName(name) === 'mountlavinia' ? MOUNT_LAVINIA_DEFAULT_PRINTER : '';

const resolveThermalPrinterName = (name?: string, configured?: string): string => {
    const normalized = (configured || '').trim();
    return normalized || getDefaultThermalPrinter(name);
};

export async function fetchBranches(): Promise<Branch[]> {
    const { data, error } = await supabase.from('branches').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        address: r.address,
        phone: r.phone,
        thermalPrinterName: resolveThermalPrinterName(r.name, r.thermal_printer_name),
        barcodePrinterName: r.barcode_printer_name || '',
    }));
}

export async function insertBranch(branch: Omit<Branch, 'id'> & { id?: string }): Promise<Branch> {
    const thermalPrinterName = resolveThermalPrinterName(branch.name, branch.thermalPrinterName);
    const { data, error } = await supabase.from('branches').insert({
        ...(branch.id ? { id: branch.id } : {}),
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        thermal_printer_name: thermalPrinterName,
        barcode_printer_name: branch.barcodePrinterName || '',
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        address: data.address,
        phone: data.phone,
        thermalPrinterName: resolveThermalPrinterName(data.name, data.thermal_printer_name),
        barcodePrinterName: data.barcode_printer_name || '',
    };
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<void> {
    const { error } = await supabase.from('branches').update({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.address !== undefined && { address: updates.address }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
        ...(updates.thermalPrinterName !== undefined && { thermal_printer_name: updates.thermalPrinterName }),
        ...(updates.barcodePrinterName !== undefined && { barcode_printer_name: updates.barcodePrinterName }),
    }).eq('id', id);
    if (error) throw error;
}
