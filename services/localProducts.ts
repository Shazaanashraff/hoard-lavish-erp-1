// Local products cache — electron-store with in-memory fallback for tests.
// Mirrors the pattern in localSettings.ts.
/* eslint-disable @typescript-eslint/no-var-requires */
import type { Product } from '../types';
import { createBrowserBackend } from './indexedDbBackend';

let Store: any;
try {
  // @ts-ignore
  Store = require('electron-store');
} catch (e) {
  Store = undefined;
}

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };
let backend: Backend;

if (process.env.NODE_ENV === 'test') {
  const mem: Record<string, any> = {};
  backend = {
    get: (k: string, def?: any) => (mem[k] === undefined ? def : mem[k]),
    set: (k: string, v: any) => { mem[k] = v; },
  };
} else if (!Store) {
  backend = createBrowserBackend('products_cache', {});
} else {
  backend = new Store({ name: 'products_cache' });
}

export interface ProductsCache {
  products: Product[];
  cachedDate: string; // YYYY-MM-DD
}

export const loadCachedProducts = (): ProductsCache | null =>
  backend.get('productsCache', null);

export const saveCachedProducts = (products: Product[], date: string): void =>
  backend.set('productsCache', { products, cachedDate: date });

/**
 * Patch one branch-slot and recompute total stock.
 * Returns a new array; products not matching productId are untouched.
 */
export const applyStockDelta = (
  products: Product[],
  productId: string,
  branchId: string,
  quantity: number,
): Product[] =>
  products.map(p => {
    if (p.id !== productId) return p;
    const updatedBranchStock = { ...p.branchStock, [branchId]: quantity };
    const stock = Object.values(updatedBranchStock).reduce((a, b) => a + b, 0);
    return { ...p, branchStock: updatedBranchStock, stock };
  });

/**
 * Merge a full set of fresh branch-stock rows into the catalog.
 * Only overwrites the qty cells present in stockRows; catalog fields are preserved.
 */
export const mergeBranchStock = (
  products: Product[],
  stockRows: Array<{ productId: string; branchId: string; quantity: number }>,
): Product[] => {
  const map: Record<string, Record<string, number>> = {};
  for (const row of stockRows) {
    if (!map[row.productId]) map[row.productId] = {};
    map[row.productId][row.branchId] = row.quantity;
  }
  return products.map(p => {
    const fresh = map[p.id];
    if (!fresh) return p;
    const updatedBranchStock = { ...p.branchStock, ...fresh };
    const stock = Object.values(updatedBranchStock).reduce((a, b) => a + b, 0);
    return { ...p, branchStock: updatedBranchStock, stock };
  });
};

export default { loadCachedProducts, saveCachedProducts, applyStockDelta, mergeBranchStock };
