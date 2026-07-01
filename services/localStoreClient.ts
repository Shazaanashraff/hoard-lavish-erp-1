// Renderer-side wrapper over the main-process electron-store IPC bridge
// (see electron/localStore.cjs, electron/preload.cjs). Falls back to an
// in-memory object in tests / any non-Electron context, matching the
// convention already used by services/localSuppliers.ts etc.
const mem: Record<string, any> = {};

function hasElectronLocalStore(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI?.localStore;
}

export async function getLocalNamespace<T>(namespace: string, fallback: T): Promise<T> {
    if (process.env.NODE_ENV === 'test' || !hasElectronLocalStore()) {
        return mem[namespace] === undefined ? fallback : mem[namespace];
    }
    const value = await (window as any).electronAPI.localStore.get(namespace);
    return value === undefined || value === null ? fallback : value;
}

export async function setLocalNamespace<T>(namespace: string, value: T): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !hasElectronLocalStore()) {
        mem[namespace] = value;
        return;
    }
    await (window as any).electronAPI.localStore.set(namespace, value);
}
