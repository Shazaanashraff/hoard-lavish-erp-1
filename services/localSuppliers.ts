// Local-first cache for suppliers using electron-store.
// Tests and non-electron environments use an in-memory fallback.
/* eslint-disable @typescript-eslint/no-var-requires */
import type { Supplier } from '../types';

let Store: any;
try {
  // @ts-ignore
  Store = require('electron-store');
} catch (e) {
  Store = undefined;
}

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };
let backend: Backend;

if (process.env.NODE_ENV === 'test' || !Store) {
  const mem: Record<string, any> = { suppliers: [] };
  backend = {
    get: (k: string, def?: any) => (mem[k] === undefined ? def : mem[k]),
    set: (k: string, v: any) => { mem[k] = v; },
  };
} else {
  backend = new Store({ name: 'app_suppliers', defaults: { suppliers: [] } });
}

export const loadLocalSuppliers = (): Supplier[] => backend.get('suppliers', []);
export const saveLocalSuppliers = (suppliers: Supplier[]): void => backend.set('suppliers', suppliers);
