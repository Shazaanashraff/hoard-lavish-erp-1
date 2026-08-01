// Shared IndexedDB-backed fallback for the browser branch of each local*.ts
// module. Every local*.ts file already has an in-memory `mem` object it
// falls back to outside Electron (see localSettings.ts and its siblings) —
// this wraps that same object with best-effort IndexedDB persistence so
// cached data (branch/product/customer lists, settings, etc.) survives a
// browser refresh, without changing any of their synchronous get/set call
// sites: hydration happens once, asynchronously, shortly after module load,
// and every write both updates `mem` synchronously (unchanged behavior) and
// fire-and-forgets a write to IndexedDB.
import { get as idbGet, set as idbSet } from 'idb-keyval';

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };

export function createBrowserBackend(storeName: string, mem: Record<string, any>): Backend {
  if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    idbGet(storeName)
      .then((saved) => {
        if (saved && typeof saved === 'object') Object.assign(mem, saved);
      })
      .catch(() => {
        // IndexedDB can be unavailable (private browsing, unsupported browser, etc.) —
        // mem just stays at its in-process defaults for this session.
      });
  }

  return {
    get: (k, def) => (mem[k] === undefined ? def : mem[k]),
    set: (k, v) => {
      mem[k] = v;
      if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
        idbSet(storeName, mem).catch(() => {});
      }
    },
  };
}
