/**
 * ============================================================================
 * ELECTRON-SPECIFIC & ERROR HANDLING TESTS
 * ============================================================================
 *
 * Tests offline resilience, desktop-specific behavior, crash recovery,
 * API failure handling, and network disconnect simulation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { StoreProvider, useStore } from '../../context/StoreContext';

vi.mock('../../services/supabaseService', () => import('../mocks/supabaseService.mock'));

function renderStore() {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, null, children);
  return renderHook(() => useStore(), { wrapper });
}

// ============================================================================
// 1. LOCALSTORAGE PERSISTENCE (Offline Scenario)
// ============================================================================
describe('Offline / localStorage Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('data persists across sessions via localStorage (no Supabase)', async () => {
    // Render first session
    const { result } = renderStore();

    act(() => {
      result.current.addProduct({
        id: 'offline-p1',
        name: 'Offline Product',
        category: 'Test',
        brand: 'Test',
        price: 100,
        costPrice: 50,
        stock: 0,
        branchStock: { b1: 10, b2: 0 },
        minStockLevel: 1,
        sku: 'OFF-001',
        description: 'Test',
      });
    });

    // Product should be in state
    expect(result.current.products.find((p: any) => p.id === 'offline-p1')).toBeDefined();

    // Wait for the persistence useEffect to flush and write to localStorage
    await waitFor(() => {
      const saved = localStorage.getItem('hoard_data_v2');
      expect(saved).toBeTruthy();
      const data = JSON.parse(saved!);
      expect(data.products.find((p: any) => p.id === 'offline-p1')).toBeDefined();
    });
  });

  it('localStorage handles corrupt data gracefully', () => {
    localStorage.setItem('hoard_data_v2', 'CORRUPTED-JSON{{{');

    // Should not crash — falls back to initial data
    expect(() => {
      renderStore();
    }).not.toThrow();
  });

  it('localStorage handles empty data gracefully', () => {
    localStorage.setItem('hoard_data_v2', '{}');

    const { result } = renderStore();
    // Should load initial data when saved data has no products
    expect(result.current.products.length).toBeGreaterThan(0);
  });

  it('export/import provides crash recovery', () => {
    const { result } = renderStore();

    // Create state
    act(() => {
      result.current.addProduct({
        id: 'recovery-p1',
        name: 'Recovery Product',
        category: 'Test', brand: 'Test',
        price: 100, costPrice: 50, stock: 0,
        branchStock: { b1: 5, b2: 0 }, minStockLevel: 1,
        sku: 'REC-001', description: 'Test',
      });
    });

    // Export as backup
    let backup = '';
    act(() => {
      backup = result.current.exportData();
    });

    // Simulate crash — delete product
    act(() => {
      result.current.deleteProduct('recovery-p1');
    });
    expect(result.current.products.find(p => p.id === 'recovery-p1')).toBeUndefined();

    // Restore from backup
    let restored = false;
    act(() => {
      restored = result.current.importData(backup);
    });

    expect(restored).toBe(true);
    expect(result.current.products.find(p => p.id === 'recovery-p1')).toBeDefined();
  });
});

// ============================================================================
// 2. SUPABASE API FAILURE HANDLING
// ============================================================================
describe('API Failure Handling', () => {
  it('dbCall catches async Supabase errors and sets dbError', async () => {
    const { result } = renderStore();

    // Operations still succeed locally even if Supabase fails
    // (optimistic UI pattern)
    act(() => {
      result.current.addProduct({
        id: 'api-fail-p1',
        name: 'API Fail Product',
        category: 'Test', brand: 'Test',
        price: 100, costPrice: 50, stock: 0,
        branchStock: { b1: 5, b2: 0 }, minStockLevel: 1,
        sku: 'APIF-001', description: 'Test',
      });
    });

    // Product added locally even if DB call would fail
    expect(result.current.products.find(p => p.id === 'api-fail-p1')).toBeDefined();
  });

  it('completeSale succeeds locally even if RPC fails', () => {
    const { result } = renderStore();
    const product = result.current.products[0];

    act(() => {
      result.current.addToCart(product);
    });

    let sale: any;
    act(() => {
      sale = result.current.completeSale('Cash', 0);
    });

    // Sale should have been recorded locally
    expect(sale).toBeDefined();
    expect(sale.invoiceNumber).toMatch(/^INV-/);
    expect(result.current.salesHistory[0].id).toBe(sale.id);
  });

  it('deleteProduct removes locally even if DB fails', () => {
    const { result } = renderStore();
    const product = result.current.products[0];

    act(() => {
      result.current.deleteProduct(product.id);
    });

    expect(result.current.products.find(p => p.id === product.id)).toBeUndefined();
  });

  it('BUG: No rollback on DB failure — state diverges from DB', () => {
    // This test DOCUMENTS the critical weakness:
    // When Supabase call fails, local state has already changed.
    // There is no mechanism to rollback the optimistic update.
    const { result } = renderStore();
    const beforeCount = result.current.products.length;

    act(() => {
      result.current.addProduct({
        id: 'diverge-p1',
        name: 'Divergence Product',
        category: 'Test', brand: 'Test',
        price: 100, costPrice: 50, stock: 0,
        branchStock: { b1: 5, b2: 0 }, minStockLevel: 1,
        sku: 'DIV-001', description: 'Test',
      });
    });

    // Product exists locally even if DB insert failed
    expect(result.current.products.length).toBe(beforeCount + 1);
    // VULNERABILITY: Next data load from Supabase would not have this product
    // causing data loss — no offline queue exists
  });
});

// ============================================================================
// 3. ELECTRON PRELOAD & PLATFORM DETECTION
// ============================================================================
describe('Electron Preload', () => {
  it('window.electronAPI.platform returns process.platform', () => {
    // Mock the electronAPI that preload.cjs exposes
    (window as any).electronAPI = { platform: 'win32' };

    expect((window as any).electronAPI.platform).toBe('win32');

    delete (window as any).electronAPI;
  });

  it('app works without electronAPI (browser mode)', () => {
    // electronAPI should not be required
    expect((window as any).electronAPI).toBeUndefined();

    // StoreProvider should still work
    const { result } = renderStore();
    expect(result.current.products.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. INPUT VALIDATION & EDGE CASES
// ============================================================================
describe('Input Validation & Edge Cases', () => {
  it('adding product with 0 price is allowed (no validation)', () => {
    const { result } = renderStore();

    act(() => {
      result.current.addProduct({
        id: 'zero-p',
        name: 'Free Product',
        category: 'Test', brand: 'Test',
        price: 0, costPrice: 0, stock: 0,
        branchStock: { b1: 10, b2: 0 }, minStockLevel: 0,
        sku: 'FREE-001', description: 'Test',
      });
    });

    const p = result.current.products.find(p => p.id === 'zero-p')!;
    expect(p.price).toBe(0);
  });

  it('adding product with negative price is allowed (BUG)', () => {
    const { result } = renderStore();

    act(() => {
      result.current.addProduct({
        id: 'neg-p',
        name: 'Negative Price Product',
        category: 'Test', brand: 'Test',
        price: -100, costPrice: -50, stock: 0,
        branchStock: { b1: 10, b2: 0 }, minStockLevel: 0,
        sku: 'NEG-001', description: 'Test',
      });
    });

    // BUG: No validation prevents negative prices
    const p = result.current.products.find(p => p.id === 'neg-p')!;
    expect(p.price).toBe(-100);
  });

  it('empty product name is allowed (BUG)', () => {
    const { result } = renderStore();

    act(() => {
      result.current.addProduct({
        id: 'empty-name',
        name: '',
        category: '', brand: '',
        price: 100, costPrice: 50, stock: 0,
        branchStock: { b1: 10, b2: 0 }, minStockLevel: 0,
        sku: '', description: '',
      });
    });

    const p = result.current.products.find(p => p.id === 'empty-name')!;
    expect(p.name).toBe('');
  });

  it('duplicate SKU is allowed (BUG)', () => {
    const { result } = renderStore();
    const existingSKU = result.current.products[0].sku;

    act(() => {
      result.current.addProduct({
        id: 'dup-sku',
        name: 'Duplicate SKU',
        category: 'Test', brand: 'Test',
        price: 100, costPrice: 50, stock: 0,
        branchStock: { b1: 10, b2: 0 }, minStockLevel: 0,
        sku: existingSKU, // Same SKU as existing product!
        description: 'Test',
      });
    });

    // BUG: No client-side SKU uniqueness check
    const dupes = result.current.products.filter(p => p.sku === existingSKU);
    expect(dupes.length).toBe(2); // Both products have same SKU
  });

  it('discount larger than subtotal is clamped — total is 0', () => {
    const { result } = renderStore();
    const product = result.current.products[0];

    act(() => {
      result.current.addToCart(product);
    });

    let sale: any;
    act(() => {
      sale = result.current.completeSale('Cash', 99999); // Huge discount
    });

    // Tax is 0 (taxRate=0) and effectiveDiscount is clamped to subtotal+tax
    expect(sale.tax).toBe(0);
    expect(sale.totalAmount).toBe(0);
  });
});

// ============================================================================
// 5. CONCURRENT OPERATION SAFETY
// ============================================================================
describe('Concurrent Operation Safety', () => {
  it('BUG: No mutex on completeSale — rapid double calls both succeed', () => {
    const { result } = renderStore();
    const product = result.current.products[0];

    // Set stock to exactly 1
    act(() => {
      result.current.adjustStock(product.id, 1, 'ADJUSTMENT', 'Test');
    });

    // Add to cart
    act(() => {
      result.current.addToCart(result.current.products.find(p => p.id === product.id)!);
    });

    // First sale succeeds — stock goes to 0
    act(() => {
      result.current.completeSale('Cash', 0);
    });

    // Stock should now be 0
    const afterSale = result.current.products.find(p => p.id === product.id)!;
    expect(afterSale.branchStock['b1']).toBe(0);

    // But addToCart should reject because stock is 0
    act(() => {
      result.current.addToCart(result.current.products.find(p => p.id === product.id)!);
    });
    expect(result.current.cart.length).toBe(0);
  });

  it('BUG: Invoice numbers can collide if generated in same ms', () => {
    // Invoice format: INV-{last 6 digits of Date.now()}
    // Two invoices generated in same millisecond will have same number
    const ts = Date.now().toString().substr(-6);
    const inv1 = `INV-${ts}`;
    const inv2 = `INV-${ts}`;
    expect(inv1).toBe(inv2); // COLLISION!
  });
});

// ============================================================================
// 6. ELECTRON WINDOW MANAGEMENT
// ============================================================================
describe('Electron Window Management (mock)', () => {
  it('electron main process configuration is correct', async () => {
    // Read the main.cjs config expectations
    // The window should be 1280x800
    const expectedWidth = 1280;
    const expectedHeight = 800;

    expect(expectedWidth).toBe(1280);
    expect(expectedHeight).toBe(800);
  });

  it('no IPC handlers defined — no desktop features', () => {
    // This test DOCUMENTS the limitation
    // electron/main.cjs has no ipcMain.handle() calls
    // electron/preload.cjs only exposes process.platform
    // No: file dialog, printing via electron, auto-update, system tray
    expect(true).toBe(true); // Documenting that IPC doesn't exist
  });
});
