// Minimal local settings helper using electron-store.
// Tests run with NODE_ENV=test use an in-memory fallback to avoid touching disk.
/* eslint-disable @typescript-eslint/no-var-requires */
import type { AppSettings } from '../types';
import { INITIAL_SETTINGS } from '../constants';

let Store: any;
try {
  // require at runtime so tests (or non-electron environments) don't fail on import
  // @ts-ignore
  Store = require('electron-store');
} catch (e) {
  Store = undefined;
}

type Backend = { get: (k: string, def?: any) => any; set: (k: string, v: any) => void };
let backend: Backend;

if (process.env.NODE_ENV === 'test' || !Store) {
  const mem: Record<string, any> = { settings: INITIAL_SETTINGS };
  backend = {
    get: (k: string, def?: any) => (mem[k] === undefined ? def : mem[k]),
    set: (k: string, v: any) => { mem[k] = v; }
  };
} else {
  backend = new Store({ name: 'app_settings', defaults: { settings: INITIAL_SETTINGS } });
}

export const loadLocalSettings = (): AppSettings => backend.get('settings', INITIAL_SETTINGS);

export const saveLocalSettings = (updates: Partial<AppSettings>): AppSettings => {
  const cur = loadLocalSettings();
  const merged = { ...cur, ...updates };
  backend.set('settings', merged);
  return merged;
};

export const setLocalSettings = (s: AppSettings) => backend.set('settings', s);

export default { loadLocalSettings, saveLocalSettings, setLocalSettings };
