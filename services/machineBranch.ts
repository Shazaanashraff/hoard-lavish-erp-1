// Per-machine assigned branch/location. Device-local truth — never synced to Supabase,
// since the same physical machine must always resolve to the same branch regardless of
// what any other machine or the cloud says.
import { getLocalNamespace, setLocalNamespace } from './localStoreClient';

const NAMESPACE = 'machineBranch';

export async function loadAssignedBranchId(): Promise<string | null> {
    const stored = await getLocalNamespace<{ branchId: string | null }>(NAMESPACE, { branchId: null });
    return stored.branchId ?? null;
}

export async function saveAssignedBranchId(branchId: string): Promise<void> {
    await setLocalNamespace(NAMESPACE, { branchId });
}
