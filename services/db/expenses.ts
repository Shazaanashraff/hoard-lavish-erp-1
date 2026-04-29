import { supabase } from '../supabaseClient';
import type { Expense } from '../../types';
import { isUuid } from './shared';

export const mapExpense = (r: any): Expense => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: r.category,
    date: r.date,
    branchId: r.branch_id,
    branchName: r.branch_name,
    paymentMethod: r.payment_method,
});

export async function fetchExpenses(): Promise<Expense[]> {
    const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExpense);
}

export async function insertExpense(expense: Expense): Promise<Expense> {
    const { data, error } = await supabase.from('expenses').insert({
        ...(expense.id && isUuid(expense.id) ? { id: expense.id } : {}),
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        branch_id: expense.branchId,
        branch_name: expense.branchName,
        payment_method: expense.paymentMethod,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        description: data.description,
        amount: Number(data.amount),
        category: data.category,
        date: data.date,
        branchId: data.branch_id,
        branchName: data.branch_name,
        paymentMethod: data.payment_method,
    };
}

export async function deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
}
