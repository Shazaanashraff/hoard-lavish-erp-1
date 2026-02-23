import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Auto cleanup after each test
afterEach(() => {
  cleanup();
  // Clear localStorage to prevent state leaking between tests.
  // StoreContext reads from localStorage on init, so stale data
  // causes cumulative state across tests.
  window.localStorage.clear();
  // Reset call tracking on alert/confirm/print so toHaveBeenCalled() is per-test.
  vi.mocked(window.alert).mockClear();
  vi.mocked(window.confirm).mockClear();
  vi.mocked(window.print).mockClear();
});

// Override import.meta.env so isSupabaseConfigured() returns false in tests.
// vi.stubGlobal('import', ...) does NOT work — import.meta.env is a Vite construct.
import.meta.env.VITE_SUPABASE_URL = '';
import.meta.env.VITE_SUPABASE_ANON_KEY = '';

// Mock window.alert
vi.stubGlobal('alert', vi.fn());

// Mock window.confirm
vi.stubGlobal('confirm', vi.fn(() => true));

// Mock window.print
vi.stubGlobal('print', vi.fn());

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true, configurable: true });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
vi.stubGlobal(
  'ResizeObserver',
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
);
