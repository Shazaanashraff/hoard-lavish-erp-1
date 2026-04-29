import { supabase } from '../supabaseClient';
import type { User } from '../../types';
import { isUuid } from './shared';

export const mapUser = (r: any): User => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pin: r.pin,
    branchId: r.branch_id ?? undefined,
});

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapUser);
}

export async function insertUser(user: User): Promise<User> {
    const { data, error } = await supabase.from('users').insert({
        ...(user.id && isUuid(user.id) ? { id: user.id } : {}),
        name: user.name,
        role: user.role,
        pin: user.pin,
        branch_id: user.branchId ?? null,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        role: data.role,
        pin: data.pin,
        branchId: data.branch_id ?? undefined,
    };
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
    if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;

    const { error } = await supabase.from('users').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
}
