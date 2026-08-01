// Local-first cache for users (mirrors localSettings.ts pattern).
// Tests and non-electron environments use an in-memory fallback.
/* eslint-disable @typescript-eslint/no-var-requires */
import type { User } from '../types';
import { INITIAL_USERS } from '../constants';
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
  const mem: Record<string, any> = { users: INITIAL_USERS };
  backend = {
    get: (k: string, def?: any) => (mem[k] === undefined ? def : mem[k]),
    set: (k: string, v: any) => { mem[k] = v; },
  };
} else if (!Store) {
  backend = createBrowserBackend('app_users', { users: INITIAL_USERS });
} else {
  backend = new Store({ name: 'app_users', defaults: { users: INITIAL_USERS } });
}

export const loadLocalUsers = (): User[] => backend.get('users', INITIAL_USERS);
export const saveLocalUsers = (users: User[]): void => backend.set('users', users);
export const setLocalUsers = (users: User[]): void => backend.set('users', users);

export default { loadLocalUsers, saveLocalUsers, setLocalUsers };
