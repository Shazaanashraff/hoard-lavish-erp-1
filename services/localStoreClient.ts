// Renderer-side wrapper over the main-process electron-store IPC bridge
// (see electron/localStore.cjs, electron/preload.cjs). Falls back to
// IndexedDB in a browser (so cached tags/categories/brands survive a
// refresh), or an in-memory object in tests / when IndexedDB is unavailable.
import { get as idbGet, set as idbSet } from 'idb-keyval';

const mem: Record<string, any> = {};

function hasElectronLocalStore(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.localStore;
}

function hasIndexedDb(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

export async function getLocalNamespace<T>(namespace: string, fallback: T): Promise<T> {
    if (process.env.NODE_ENV === 'test') {
        return mem[namespace] === undefined ? fallback : mem[namespace];
    }
    if (hasElectronLocalStore()) {
        const value = await (window as any).electronAPI.localStore.get(namespace);
        return value === undefined || value === null ? fallback : value;
    }
    if (hasIndexedDb()) {
        const value = await idbGet(namespace).catch(() => undefined);
        return value === undefined || value === null ? fallback : value;
    }
    return mem[namespace] === undefined ? fallback : mem[namespace];
}

export async function setLocalNamespace<T>(namespace: string, value: T): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
        mem[namespace] = value;
        return;
    }
    if (hasElectronLocalStore()) {
        await (window as any).electronAPI.localStore.set(namespace, value);
        return;
    }
    mem[namespace] = value;
    if (hasIndexedDb()) {
        await idbSet(namespace, value).catch(() => {});
    }
}
