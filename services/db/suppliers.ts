import { supabase } from '../supabaseClient';
import type { Supplier, SupplierTransaction } from '../../types';
import { isUuid, SupabaseErrorLike } from './shared';

const SUPPLIER_TX_ACCOUNTING_COLUMN = 'affects_accounting';
let supplierTxAccountingColumnAvailable: boolean | null = null;

const isMissingSupplierAccountingColumnError = (error: unknown): boolean => {
    const dbError = error as SupabaseErrorLike | null;
    if (!dbError) return false;
    const code = (dbError.code || '').toUpperCase();
    if (code === 'PGRST204' || code === '42703') return true;
    const message = `${dbError.message || ''} ${dbError.details || ''} ${dbError.hint || ''}`.toLowerCase();
    return message.includes(SUPPLIER_TX_ACCOUNTING_COLUMN) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('unknown'));
};

export const mapSupplier = (r: any): Supplier => ({
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    phone: r.phone,
    email: r.email,
    address: r.address,
    status: r.status,
} as any);

export async function fetchSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapSupplier);
}

export async function insertSupplier(supplier: Supplier): Promise<Supplier> {
    const { data, error } = await supabase.from('suppliers').insert({
        ...(supplier.id && isUuid(supplier.id) ? { id: supplier.id } : {}),
        name: supplier.name,
        contact_person: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        contactPerson: data.contact_person,
        phone: data.phone,
        email: data.email,
        address: data.address,
    };
}

export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.contactPerson !== undefined) dbUpdates.contact_person = updates.contactPerson;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.address !== undefined) dbUpdates.address = updates.address;

    const { error } = await supabase.from('suppliers').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
}

export const mapSupplierTransaction = (r: any): SupplierTransaction => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    date: r.date,
    amount: Number(r.amount),
    type: r.type,
    reference: r.reference,
    notes: r.notes,
    affectsAccounting: r.affects_accounting ?? false,
});

export interface FetchSupplierTransactionsOptions {
    supplierId?: string;
    type?: 'PAYMENT' | 'REFUND';
    dateFrom?: string;
    dateTo?: string;
    affectsAccounting?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
}

export async function fetchSupplierTransactions(options: FetchSupplierTransactionsOptions = {}): Promise<SupplierTransaction[]> {
    let query = supabase
        .from('supplier_transactions')
        .select('*')
        .order('date', { ascending: false });
    if (options.supplierId) query = query.eq('supplier_id', options.supplierId);
    if (options.type) query = query.eq('type', options.type);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.affectsAccounting !== undefined && supplierTxAccountingColumnAvailable !== false) {
        query = query.eq('affects_accounting', options.affectsAccounting);
    }
    if (options.search) {
        const q = options.search.replace(/'/g, "''");
        query = query.or(`supplier_name.ilike.%${q}%,reference.ilike.%${q}%`);
    }
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);

    const { data, error } = await query;

    if (!error) {
        if (data && data.length > 0 && supplierTxAccountingColumnAvailable !== false) {
            supplierTxAccountingColumnAvailable = Object.prototype.hasOwnProperty.call(data[0], SUPPLIER_TX_ACCOUNTING_COLUMN);
        }
        return (data ?? []).map(mapSupplierTransaction);
    }

    if (isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;
        let fallbackQuery = supabase
            .from('supplier_transactions')
            .select('id, supplier_id, supplier_name, date, amount, type, reference, notes')
            .order('date', { ascending: false });
        if (options.supplierId) fallbackQuery = fallbackQuery.eq('supplier_id', options.supplierId);
        if (options.type) fallbackQuery = fallbackQuery.eq('type', options.type);
        if (options.dateFrom) fallbackQuery = fallbackQuery.gte('date', options.dateFrom);
        if (options.dateTo) fallbackQuery = fallbackQuery.lte('date', options.dateTo);
        if (options.search) {
            const q = options.search.replace(/'/g, "''");
            fallbackQuery = fallbackQuery.or(`supplier_name.ilike.%${q}%,reference.ilike.%${q}%`);
        }
        if (options.limit !== undefined) fallbackQuery = fallbackQuery.limit(options.limit);
        if (options.offset !== undefined) fallbackQuery = fallbackQuery.range(options.offset, options.offset + (options.limit ?? 50) - 1);
        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) throw fallbackError;
        return (fallbackData ?? []).map(mapSupplierTransaction);
    }

    throw error;
}

export async function insertSupplierTransaction(txn: SupplierTransaction): Promise<void> {
    const basePayload = {
        supplier_id: txn.supplierId,
        supplier_name: txn.supplierName,
        date: txn.date,
        amount: txn.amount,
        type: txn.type,
        reference: txn.reference,
        notes: txn.notes,
    };

    const withAccounting = supplierTxAccountingColumnAvailable !== false
        ? { ...basePayload, affects_accounting: txn.affectsAccounting ?? false }
        : basePayload;

    const { error } = await supabase.from('supplier_transactions').insert(withAccounting);
    if (!error) {
        if (supplierTxAccountingColumnAvailable !== false) supplierTxAccountingColumnAvailable = true;
        return;
    }

    if (supplierTxAccountingColumnAvailable !== false && isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;
        const { error: retryError } = await supabase.from('supplier_transactions').insert(basePayload);
        if (!retryError) return;
        throw retryError;
    }

    throw error;
}

export async function updateSupplierTransaction(id: string, updates: Partial<SupplierTransaction>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.supplierId !== undefined) dbUpdates.supplier_id = updates.supplierId;
    if (updates.supplierName !== undefined) dbUpdates.supplier_name = updates.supplierName;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.reference !== undefined) dbUpdates.reference = updates.reference;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.affectsAccounting !== undefined && supplierTxAccountingColumnAvailable !== false) {
        dbUpdates.affects_accounting = updates.affectsAccounting;
    }

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase.from('supplier_transactions').update(dbUpdates).eq('id', id);
    if (!error) {
        if (Object.prototype.hasOwnProperty.call(dbUpdates, 'affects_accounting') && supplierTxAccountingColumnAvailable !== false) {
            supplierTxAccountingColumnAvailable = true;
        }
        return;
    }

    if (Object.prototype.hasOwnProperty.call(dbUpdates, 'affects_accounting') && supplierTxAccountingColumnAvailable !== false && isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;
        delete dbUpdates.affects_accounting;
        if (Object.keys(dbUpdates).length === 0) return;
        const { error: retryError } = await supabase.from('supplier_transactions').update(dbUpdates).eq('id', id);
        if (!retryError) return;
        throw retryError;
    }

    throw error;
}

export async function deleteSupplierTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('supplier_transactions').delete().eq('id', id);
    if (error) throw error;
}
