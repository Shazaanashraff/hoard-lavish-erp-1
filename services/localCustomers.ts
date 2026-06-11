// In-memory fallback for tests; electron-store for production.
import type { Customer } from '../types';

let Store: any;
try { Store = require('electron-store'); } catch { Store = undefined; }

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };
let backend: Backend;

if (process.env.NODE_ENV === 'test' || !Store) {
  const mem: Record<string, any> = {};
  backend = {
    get: (k, def) => (mem[k] === undefined ? def : mem[k]),
    set: (k, v) => { mem[k] = v; },
  };
} else {
  backend = new Store({ name: 'customers_cache' });
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export const loadCachedCustomers = (): Customer[] => backend.get('customers', []);
export const saveCachedCustomers = (customers: Customer[], date: string) => {
  backend.set('customers', customers);
  backend.set('cachedDate', date);
};
export const upsertCachedCustomer = (customer: Customer) => {
  const list = loadCachedCustomers();
  const idx = list.findIndex(c => c.id === customer.id);
  if (idx >= 0) list[idx] = customer; else list.push(customer);
  backend.set('customers', list);
};
export const removeCachedCustomer = (id: string) => {
  backend.set('customers', loadCachedCustomers().filter(c => c.id !== id));
};
export const isCacheFresh = (): boolean => backend.get('cachedDate', '') === TODAY();
