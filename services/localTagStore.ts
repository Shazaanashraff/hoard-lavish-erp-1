// Shared local-first cache logic for "tag" lists (categories/brands): a small
// set of named, renameable, soft-deletable records that must be readable
// without ever touching the network, and reconciled against Supabase in the
// background using per-record last-write-wins.
import { getLocalNamespace, setLocalNamespace } from './localStoreClient';

export interface TagRecord {
    id: string;
    name: string;
    updatedAt: string;
    deletedAt: string | null;
}

interface TagNamespaceShape<T extends TagRecord> {
    records: T[];
    lastSyncedAt: string | null;
}

const memoByNamespace: Record<string, TagRecord[]> = {};

export async function loadLocalTags<T extends TagRecord>(namespace: string): Promise<T[]> {
    if (memoByNamespace[namespace]) return memoByNamespace[namespace] as T[];
    const stored = await getLocalNamespace<TagNamespaceShape<T>>(namespace, { records: [], lastSyncedAt: null });
    memoByNamespace[namespace] = stored.records ?? [];
    return memoByNamespace[namespace] as T[];
}

export async function saveLocalTags<T extends TagRecord>(namespace: string, records: T[]): Promise<void> {
    memoByNamespace[namespace] = records;
    await setLocalNamespace(namespace, { records, lastSyncedAt: new Date().toISOString() });
}

export function activeTagNames(records: TagRecord[]): string[] {
    return records
        .filter(r => !r.deletedAt)
        .map(r => r.name)
        .sort((a, b) => a.localeCompare(b));
}

export function pruneTombstones<T extends TagRecord>(records: T[], olderThanDays = 90): T[] {
    const cutoff = Date.now() - olderThanDays * 86400000;
    return records.filter(r => !r.deletedAt || new Date(r.deletedAt).getTime() > cutoff);
}

export function findActiveByName<T extends TagRecord>(records: T[], name: string): T | undefined {
    const normalized = name.trim().toLowerCase();
    return records.find(r => !r.deletedAt && r.name.trim().toLowerCase() === normalized);
}

/**
 * Per-id last-write-wins merge between local and remote (Supabase-fetched) tag records.
 * - Same id on both sides: newer `updatedAt` wins; exact tie favors remote (deterministic
 *   tie-break so two devices converge instead of diverging).
 * - id only in remote: adopted (another device's change reconciling in).
 * - id only in local: kept as-is — it may be a pending write not yet synced; a merge must
 *   never drop it just because the remote fetch didn't happen to include it.
 */
export function mergeTagsLWW<T extends TagRecord>(local: T[], remote: T[]): T[] {
    const byId = new Map<string, T>();
    for (const rec of local) byId.set(rec.id, rec);
    for (const rec of remote) {
        const existing = byId.get(rec.id);
        if (!existing) {
            byId.set(rec.id, rec);
            continue;
        }
        const remoteTime = new Date(rec.updatedAt).getTime();
        const localTime = new Date(existing.updatedAt).getTime();
        if (remoteTime >= localTime) byId.set(rec.id, rec);
    }
    return Array.from(byId.values());
}
