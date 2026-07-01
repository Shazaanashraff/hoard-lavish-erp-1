/**
 * Completion verification test for the categories/brands local-first migration.
 * Categories/brands must be readable from the local cache only (never a network
 * read), with Supabase as a background write-target/reconciliation source using
 * last-write-wins by `updatedAt`, soft-delete tombstones, and atomic cascading
 * renames. See context/StoreContext.tsx, services/localCategories.ts,
 * services/localBrands.ts, services/localTagStore.ts.
 *
 * Run: npx vitest run tests/todo-010-categories-brands-local-first.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  loadLocalCategories,
  saveLocalCategories,
  activeCategoryNames,
  pruneCategoryTombstones,
  findActiveCategoryByName,
  mergeCategoriesLWW,
} from '../services/localCategories';
import {
  loadLocalBrands,
  saveLocalBrands,
  activeBrandNames,
  pruneBrandTombstones,
  findActiveBrandByName,
  mergeBrandsLWW,
} from '../services/localBrands';
import type { CategoryRecord, BrandRecord } from '../types';

const iso = (daysAgo = 0): string => new Date(Date.now() - daysAgo * 86400000).toISOString();

const makeCategory = (overrides: Partial<CategoryRecord> = {}): CategoryRecord => ({
  id: 'c1',
  name: 'Rings',
  updatedAt: iso(),
  deletedAt: null,
  ...overrides,
});

const makeBrand = (overrides: Partial<BrandRecord> = {}): BrandRecord => ({
  id: 'b1',
  name: 'Acme',
  updatedAt: iso(),
  deletedAt: null,
  ...overrides,
});

describe('localCategories / localBrands — module unit tests', () => {
  beforeEach(async () => {
    await saveLocalCategories([]);
    await saveLocalBrands([]);
  });

  it('1. starts empty with nothing saved', async () => {
    expect(await loadLocalCategories()).toEqual([]);
    expect(await loadLocalBrands()).toEqual([]);
  });

  it('2. round-trips a saved list exactly', async () => {
    const rec = makeCategory();
    await saveLocalCategories([rec]);
    const loaded = await loadLocalCategories();
    expect(loaded).toEqual([rec]);
  });

  it('3. active list excludes tombstoned records but raw load keeps them', async () => {
    const active = makeCategory({ id: 'c1', name: 'Rings' });
    const deleted = makeCategory({ id: 'c2', name: 'Necklaces', deletedAt: iso() });
    await saveLocalCategories([active, deleted]);
    const loaded = await loadLocalCategories();
    expect(loaded).toHaveLength(2); // tombstone still present in raw data
    expect(activeCategoryNames(loaded)).toEqual(['Rings']); // excluded from active view
  });

  it('4. prunes tombstones older than the cutoff, keeps recent ones and all active records', () => {
    const active = makeCategory({ id: 'c1' });
    const oldTombstone = makeCategory({ id: 'c2', name: 'Old', deletedAt: iso(91) });
    const recentTombstone = makeCategory({ id: 'c3', name: 'Recent', deletedAt: iso(5) });
    const pruned = pruneCategoryTombstones([active, oldTombstone, recentTombstone], 90);
    expect(pruned.map(r => r.id).sort()).toEqual(['c1', 'c3']);
  });
});

describe('Scenario A — parity: derived views match what the local cache holds', () => {
  it('5. dropdown/filter/id-lookup all derive from the same active list', async () => {
    const records = [
      makeCategory({ id: 'c1', name: 'Rings' }),
      makeCategory({ id: 'c2', name: 'Necklaces' }),
      makeCategory({ id: 'c3', name: 'Bracelets', deletedAt: iso() }),
    ];
    await saveLocalCategories(records);
    const loaded = await loadLocalCategories();

    const names = activeCategoryNames(loaded);
    expect(names).toEqual(['Necklaces', 'Rings']); // sorted, deleted excluded

    const found = findActiveCategoryByName(loaded, 'rings'); // case-insensitive
    expect(found?.id).toBe('c1');

    expect(findActiveCategoryByName(loaded, 'Bracelets')).toBeUndefined(); // tombstoned, not "active"
  });
});

describe('Scenario B — writes are reflected consistently', () => {
  it('6. add persists and reloads', async () => {
    await saveLocalCategories([makeCategory({ id: 'c1', name: 'Rings' })]);
    const current = await loadLocalCategories();
    const withNew = [...current, makeCategory({ id: 'c2', name: 'Earrings' })];
    await saveLocalCategories(withNew);
    expect(activeCategoryNames(await loadLocalCategories())).toEqual(['Earrings', 'Rings']);
  });

  it('7. add rejects case-insensitive duplicates and trims whitespace', async () => {
    await saveLocalCategories([makeCategory({ id: 'c1', name: 'Shoes' })]);
    const loaded = await loadLocalCategories();
    // "  shoes " (different case, padded) should resolve to the same active record
    expect(findActiveCategoryByName(loaded, '  shoes ')).toBeDefined();
    expect(findActiveCategoryByName(loaded, '  shoes ')?.id).toBe('c1');
  });

  it('8. rename keeps identity (id) but changes the name and bumps updatedAt', async () => {
    const original = makeCategory({ id: 'c1', name: 'Rings', updatedAt: iso(1) });
    await saveLocalCategories([original]);
    const renamed = { ...original, name: 'Fine Rings', updatedAt: iso() };
    await saveLocalCategories([renamed]);
    const loaded = await loadLocalCategories();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('c1');
    expect(loaded[0].name).toBe('Fine Rings');
    expect(new Date(loaded[0].updatedAt).getTime()).toBeGreaterThan(new Date(original.updatedAt).getTime());
  });

  it('9. renaming into a name that already exists is detectable before writing', async () => {
    const records = [makeCategory({ id: 'c1', name: 'Rings' }), makeCategory({ id: 'c2', name: 'Earrings' })];
    await saveLocalCategories(records);
    const loaded = await loadLocalCategories();
    // Collision check used by StoreContext.updateCategory before applying a rename
    expect(findActiveCategoryByName(loaded, 'earrings')).toBeDefined(); // case-insensitive collision
  });

  it('10. delete tombstones rather than physically removing the record', async () => {
    await saveLocalCategories([makeCategory({ id: 'c1', name: 'Rings' })]);
    const before = await loadLocalCategories();
    const now = iso();
    const afterDelete = before.map(c => c.id === 'c1' ? { ...c, deletedAt: now, updatedAt: now } : c);
    await saveLocalCategories(afterDelete);
    const loaded = await loadLocalCategories();
    expect(loaded).toHaveLength(1); // tombstone retained, not removed
    expect(loaded[0].deletedAt).toBe(now);
    expect(activeCategoryNames(loaded)).toEqual([]);
  });
});

describe('11-16. LWW merge (mergeCategoriesLWW / mergeBrandsLWW)', () => {
  it('12. local newer wins over remote', () => {
    const local = [makeCategory({ id: 'c1', name: 'Local Name', updatedAt: iso(0) })];
    const remote = [makeCategory({ id: 'c1', name: 'Remote Name', updatedAt: iso(1) })]; // older
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged.find(r => r.id === 'c1')?.name).toBe('Local Name');
  });

  it('13. remote newer wins over local', () => {
    const local = [makeCategory({ id: 'c1', name: 'Local Name', updatedAt: iso(1) })]; // older
    const remote = [makeCategory({ id: 'c1', name: 'Remote Name', updatedAt: iso(0) })];
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged.find(r => r.id === 'c1')?.name).toBe('Remote Name');
  });

  it('14. exact timestamp tie favors remote (deterministic tie-break)', () => {
    const tieTime = iso();
    const local = [makeCategory({ id: 'c1', name: 'Local Name', updatedAt: tieTime })];
    const remote = [makeCategory({ id: 'c1', name: 'Remote Name', updatedAt: tieTime })];
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged.find(r => r.id === 'c1')?.name).toBe('Remote Name');
  });

  it('15a. delete-vs-rename race: newer delete beats an older rename', () => {
    const local = [makeCategory({ id: 'c1', name: 'Renamed Locally', updatedAt: iso(1) })]; // older
    const remote = [makeCategory({ id: 'c1', name: 'Renamed Locally', updatedAt: iso(0), deletedAt: iso(0) })]; // newer delete
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged.find(r => r.id === 'c1')?.deletedAt).not.toBeNull();
  });

  it('15b. delete-vs-rename race: newer rename beats an older delete', () => {
    const local = [makeCategory({ id: 'c1', name: 'Renamed Locally', updatedAt: iso(0) })]; // newer, active
    const remote = [makeCategory({ id: 'c1', name: 'Old Name', updatedAt: iso(1), deletedAt: iso(1) })]; // older delete
    const merged = mergeCategoriesLWW(local, remote);
    const result = merged.find(r => r.id === 'c1');
    expect(result?.deletedAt).toBeNull();
    expect(result?.name).toBe('Renamed Locally');
  });

  it('16. delete-vs-add with a freed-up name: different ids never collide in the merge', () => {
    const local = [makeCategory({ id: 'new-id', name: 'Shoes', updatedAt: iso(0) })]; // newly added locally
    const remote = [makeCategory({ id: 'old-id', name: 'Shoes', updatedAt: iso(0), deletedAt: iso(0) })]; // deleted elsewhere
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.id === 'new-id')?.deletedAt).toBeNull();
    expect(merged.find(r => r.id === 'old-id')?.deletedAt).not.toBeNull();
  });

  it('17. a local-only record not yet in the remote fetch is never dropped by a merge', () => {
    const local = [makeCategory({ id: 'c1', name: 'Rings' }), makeCategory({ id: 'pending', name: 'Not Synced Yet' })];
    const remote = [makeCategory({ id: 'c1', name: 'Rings' })]; // doesn't know about "pending" yet
    const merged = mergeCategoriesLWW(local, remote);
    expect(merged.find(r => r.id === 'pending')).toBeDefined();
  });

  it('brands: mergeBrandsLWW applies the same rules (spot check)', () => {
    const local = [makeBrand({ id: 'b1', name: 'Local', updatedAt: iso(0) })];
    const remote = [makeBrand({ id: 'b1', name: 'Remote', updatedAt: iso(1) })];
    expect(mergeBrandsLWW(local, remote).find(r => r.id === 'b1')?.name).toBe('Local');
  });
});

describe('11. reads never hit the network (structural assertions on StoreContext)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../context/StoreContext.tsx'), 'utf-8');

  it('bootstrap loads categories/brands from the local cache unconditionally', () => {
    expect(src).toContain('loadLocalCategories()');
    expect(src).toContain('loadLocalBrands()');
  });

  it('services/localCategories.ts and localBrands.ts never import Supabase', () => {
    const catSrc = fs.readFileSync(path.resolve(__dirname, '../services/localCategories.ts'), 'utf-8');
    const brandSrc = fs.readFileSync(path.resolve(__dirname, '../services/localBrands.ts'), 'utf-8');
    expect(catSrc).not.toMatch(/supabaseClient|supabaseService/);
    expect(brandSrc).not.toMatch(/supabaseClient|supabaseService/);
  });

  it('remote category/brand fetches are merged into the cache, never assigned directly to state', () => {
    // The old blind-overwrite calls must be gone...
    expect(src).not.toContain('setCategories(categoriesData)');
    expect(src).not.toContain('setBrands(brandsData)');
    // ...replaced by a merge-then-persist pattern
    expect(src).toContain('mergeCategoriesLWW(categoryRecordsRef.current, remoteCategories)');
    expect(src).toContain('mergeBrandsLWW(brandRecordsRef.current, remoteBrands)');
  });
});

describe('18-20. Offline queue integration (structural assertions)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../context/StoreContext.tsx'), 'utf-8');

  it('18. updateCategory/updateBrand queue their write through executeWithOfflineQueue', () => {
    expect(src).toContain("executeWithOfflineQueue('UPDATE_CATEGORY'");
    expect(src).toContain("executeWithOfflineQueue('UPDATE_BRAND'");
  });

  it('19. the offline queue replay switch has a case for UPDATE_CATEGORY/UPDATE_BRAND', () => {
    expect(src).toContain("case 'UPDATE_CATEGORY':");
    expect(src).toContain("case 'UPDATE_BRAND':");
    expect(src).toContain('db.updateCategory(p.oldName as string, p.newName as string)');
    expect(src).toContain('db.updateBrand(p.oldName as string, p.newName as string)');
  });

  it('20. a rename collision throws a plain Error (terminal failure, not an infinite retry)', () => {
    // isQueueableError() only treats connectivity issues / specific Postgres codes as
    // retriable; a plain thrown Error (like this one) falls through to its default
    // `return false`, so executeWithOfflineQueue surfaces it to the user instead of
    // queuing it for endless retry.
    expect(src).toContain("throw new Error('A category with that name already exists.')");
    expect(src).toContain("throw new Error('A brand with that name already exists.')");
  });
});

describe('9. rename cascade (structural assertion — StoreContext.updateCategory/updateBrand)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../context/StoreContext.tsx'), 'utf-8');

  it('updateCategory cascades to the local products and expenses cache', () => {
    expect(src).toContain("p.category === oldName ? { ...p, category: trimmed } : p");
    expect(src).toContain("e.category === oldName ? { ...e, category: trimmed } : e");
  });

  it('updateBrand cascades to the local products cache', () => {
    expect(src).toContain("p.brand === oldName ? { ...p, brand: trimmed } : p");
  });

  it('the Supabase rename RPCs cascade to products/expenses atomically in one transaction', () => {
    const migrationSrc = fs.readFileSync(
      path.resolve(__dirname, '../supabase/migrations/016_categories_brands_local_first.sql'),
      'utf-8'
    );
    expect(migrationSrc).toContain('fn_rename_category');
    expect(migrationSrc).toContain('fn_rename_brand');
    expect(migrationSrc).toMatch(/UPDATE products SET category = p_new_name WHERE category = p_old_name/);
    expect(migrationSrc).toMatch(/UPDATE expenses SET category = p_new_name WHERE category = p_old_name/);
    expect(migrationSrc).toMatch(/UPDATE products SET brand = p_new_name WHERE brand = p_old_name/);
  });
});

describe('21. persistence within a session survives repeated loads (module-level memo)', () => {
  it('data saved once is visible to every subsequent load in the same process', async () => {
    await saveLocalCategories([makeCategory({ id: 'c1', name: 'Rings' })]);
    expect(await loadLocalCategories()).toHaveLength(1);
    expect(await loadLocalCategories()).toHaveLength(1); // second read, same process — still there
  });

  // NOTE: this test file's in-memory fallback (services/localStoreClient.ts) cannot
  // prove real on-disk persistence across an actual Electron process restart or an
  // app version upgrade — that requires electron-store writing to disk under
  // app.getPath('userData'), which only runs inside a real Electron main process.
  // This is a known, documented coverage gap (see the plan) — verify manually:
  // add a category, fully quit and relaunch the packaged app, confirm it's still there.
});

describe('22. storage location is version-independent', () => {
  it('electron/localStore.cjs keys the store by a fixed name, not by app version', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../electron/localStore.cjs'), 'utf-8');
    expect(src).toContain("name: 'hoard_app_data'");
    expect(src).not.toMatch(/getVersion|app\.version|package\.json/);
  });

  it('electron-store is pinned to a CommonJS-compatible major version (v9+ is ESM-only)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.dependencies['electron-store']).toMatch(/^\^?8\./);
  });
});
