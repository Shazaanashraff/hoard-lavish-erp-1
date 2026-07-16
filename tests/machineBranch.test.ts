/**
 * Unit tests for the per-machine assigned branch/location (services/machineBranch.ts).
 * This is device-local truth (electron-store, never synced to Supabase) — see
 * services/localStoreClient.ts for the in-memory fallback used here in tests.
 *
 * Run: npx vitest run tests/machineBranch.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAssignedBranchId, saveAssignedBranchId } from '../services/machineBranch';
import { setLocalNamespace } from '../services/localStoreClient';

describe('machineBranch — per-machine assigned branch', () => {
  beforeEach(async () => {
    await setLocalNamespace('machineBranch', { branchId: null });
  });

  it('defaults to null when nothing has been assigned', async () => {
    expect(await loadAssignedBranchId()).toBeNull();
  });

  it('round-trips a saved branch id', async () => {
    await saveAssignedBranchId('branch-1');
    expect(await loadAssignedBranchId()).toBe('branch-1');
  });

  it('overwrites a previous assignment', async () => {
    await saveAssignedBranchId('branch-1');
    await saveAssignedBranchId('branch-2');
    expect(await loadAssignedBranchId()).toBe('branch-2');
  });
});
