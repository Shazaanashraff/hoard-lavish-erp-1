import { supabase } from '../supabaseClient';
import type { User } from '../../types';
import { isUuid } from './shared';

export const mapUser = (r: any): User => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pinHash: r.pin_hash ?? undefined,
    branchId: r.branch_id ?? undefined,
});

const SAFE_COLUMNS = 'id, name, role, pin_hash, branch_id, created_at';

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select(SAFE_COLUMNS).order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapUser);
}

// `pin` is the plaintext PIN typed into the Settings "New User" form — it is
// never written to a column directly. It's hashed server-side by the
// fn_set_user_pin RPC, which is the only thing allowed to write pin_hash
// (see supabase/migrations/017_security_hardening.sql).
export async function insertUser(user: User & { pin: string }): Promise<User> {
    const { data, error } = await supabase.from('users').insert({
        ...(user.id && isUuid(user.id) ? { id: user.id } : {}),
        name: user.name,
        role: user.role,
        branch_id: user.branchId ?? null,
    }).select('id, name, role, branch_id, created_at').single();
    if (error) throw error;

    const { error: pinError } = await supabase.rpc('fn_set_user_pin', { p_user_id: data.id, p_new_pin: user.pin });
    if (pinError) throw pinError;

    return {
        id: data.id,
        name: data.name,
        role: data.role,
        branchId: data.branch_id ?? undefined,
    };
}

export async function updateUser(id: string, updates: Partial<User> & { pin?: string }): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;

    if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase.from('users').update(dbUpdates).eq('id', id);
        if (error) throw error;
    }

    if (updates.pin) {
        const { error: pinError } = await supabase.rpc('fn_set_user_pin', { p_user_id: id, p_new_pin: updates.pin });
        if (pinError) throw pinError;
    }
}

export async function deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
}

// Verifies a PIN against the server without ever downloading the user list.
// Returns the matching user's safe fields, or null if no PIN matched.
export async function verifyPin(pin: string): Promise<User | null> {
    const { data, error } = await supabase.rpc('fn_verify_pin', { p_pin: pin });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        role: row.role,
        branchId: row.branch_id ?? undefined,
    };
}
