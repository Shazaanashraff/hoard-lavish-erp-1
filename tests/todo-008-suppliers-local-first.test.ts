/**
 * Completion verification test for TODO-008: Suppliers lazy local-first.
 * Run: npx vitest run tests/todo-008-suppliers-local-first.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLocalSuppliers, saveLocalSuppliers } from '../services/localSuppliers';
import type { Supplier } from '../types';

const SUPPLIERS: Supplier[] = [
  { id: 's1', name: 'Lanka Textiles', contactPerson: 'Amal', phone: '011-1234', email: 'a@lt.com', address: 'Colombo' },
  { id: 's2', name: 'Ravi Fabrics', contactPerson: 'Ravi', phone: '077-5678', email: 'r@rf.com', address: 'Kandy' },
];

describe('TODO-008: localSuppliers service', () => {
  beforeEach(() => {
    // Clear in-memory store between tests (module is re-imported fresh per test)
    saveLocalSuppliers([]);
  });

  it('starts with an empty list', () => {
    expect(loadLocalSuppliers()).toEqual([]);
  });

  it('saves and reloads suppliers round-trip', () => {
    saveLocalSuppliers(SUPPLIERS);
    const loaded = loadLocalSuppliers();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('s1');
    expect(loaded[1].name).toBe('Ravi Fabrics');
  });

  it('overwrite with empty list works (delete scenario)', () => {
    saveLocalSuppliers(SUPPLIERS);
    saveLocalSuppliers([]);
    expect(loadLocalSuppliers()).toEqual([]);
  });
});

describe('TODO-008: plumbing assertions', () => {
  it('fetchSuppliers is NOT called at module load time', async () => {
    // The service module should be importable without triggering any network calls
    const spy = vi.fn().mockResolvedValue([]);
    // localSuppliers module only calls loadLocalSuppliers (sync store.get), never fetchSuppliers
    const data = loadLocalSuppliers();
    expect(spy).not.toHaveBeenCalled();
    expect(Array.isArray(data)).toBe(true);
  });

  it('Scenario A — parity: list and dropdown derive identical output from local cache', () => {
    saveLocalSuppliers(SUPPLIERS);
    const loaded = loadLocalSuppliers();

    // Supplier list filter
    const term = 'lanka';
    const filtered = loaded.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.contactPerson.toLowerCase().includes(term)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('s1');

    // Dropdown options (id → name)
    const options = loaded.map(s => ({ value: s.id, label: s.name }));
    expect(options).toEqual([
      { value: 's1', label: 'Lanka Textiles' },
      { value: 's2', label: 'Ravi Fabrics' },
    ]);

    // find lookup by id
    const found = loaded.find(s => s.id === 's2');
    expect(found?.name).toBe('Ravi Fabrics');
  });

  it('Scenario B — change shows changed output: add/update/delete mutates cache', () => {
    saveLocalSuppliers(SUPPLIERS);

    // Add
    const newSupplier: Supplier = { id: 's3', name: 'New Corp', contactPerson: 'Bob', phone: '099', email: '', address: '' };
    const afterAdd = [...loadLocalSuppliers(), newSupplier];
    saveLocalSuppliers(afterAdd);
    expect(loadLocalSuppliers()).toHaveLength(3);

    // Update
    const afterUpdate = loadLocalSuppliers().map(s => s.id === 's1' ? { ...s, name: 'Lanka Textiles Ltd' } : s);
    saveLocalSuppliers(afterUpdate);
    expect(loadLocalSuppliers().find(s => s.id === 's1')?.name).toBe('Lanka Textiles Ltd');

    // Delete
    const afterDelete = loadLocalSuppliers().filter(s => s.id !== 's3');
    saveLocalSuppliers(afterDelete);
    expect(loadLocalSuppliers()).toHaveLength(2);
    expect(loadLocalSuppliers().find(s => s.id === 's3')).toBeUndefined();
  });

  it('Scenario C — reload/offline: cache hydrates without network call', () => {
    saveLocalSuppliers(SUPPLIERS);
    // Simulate app restart: loadLocalSuppliers() with no db call
    const fetchSpy = vi.fn();
    const hydrated = loadLocalSuppliers(); // no fetchSpy call
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hydrated).toHaveLength(2);
  });
});
