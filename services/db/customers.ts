import { supabase } from '../supabaseClient';
import type { Customer } from '../../types';
import { isUuid } from './shared';

export const mapCustomer = (r: any): Customer => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    loyaltyPoints: r.loyalty_points,
    totalSpent: Number(r.total_spent),
});

export async function fetchCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapCustomer);
}

export async function insertCustomer(customer: Customer): Promise<Customer> {
    const { data, error } = await supabase.from('customers').insert({
        ...(customer.id && isUuid(customer.id) ? { id: customer.id } : {}),
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        loyalty_points: customer.loyaltyPoints,
        total_spent: customer.totalSpent,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        loyaltyPoints: data.loyalty_points,
        totalSpent: Number(data.total_spent),
    };
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.loyaltyPoints !== undefined) dbUpdates.loyalty_points = updates.loyaltyPoints;
    if (updates.totalSpent !== undefined) dbUpdates.total_spent = updates.totalSpent;

    const { error } = await supabase.from('customers').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
}
