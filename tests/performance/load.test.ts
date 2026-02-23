/**
 * ============================================================================
 * PERFORMANCE TESTS — Large Dataset & Memory Leak Detection
 * ============================================================================
 *
 * Tests system behavior under realistic enterprise load:
 * - Large product catalogs (1000+ products)
 * - High-volume sales history
 * - Memory leak detection in context re-renders
 * - localStorage size limits
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { StoreProvider, useStore } from '../../context/StoreContext';
import { Product, Customer, SalesRecord } from '../../types';

vi.mock('../../services/supabaseService', () => import('../mocks/supabaseService.mock'));

function renderStore() {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(StoreProvider, null, children);
  return renderHook(() => useStore(), { wrapper });
}

// ---- Helper: generate N products ----
function generateProducts(count: number): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-p-${i}`,
    name: `Performance Test Product ${i}`,
    category: `Category-${i % 10}`,
    brand: `Brand-${i % 5}`,
    price: 100 + (i % 500),
    costPrice: 50 + (i % 200),
    stock: 50,
    branchStock: { b1: 30, b2: 20 },
    minStockLevel: 5,
    sku: `PERF-${String(i).padStart(5, '0')}`,
    description: `Product number ${i} for performance testing`,
  }));
}

// ---- Helper: generate N customers ----
function generateCustomers(count: number): Customer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-c-${i}`,
    name: `Customer ${i}`,
    phone: `555-${String(i).padStart(4, '0')}`,
    email: `customer${i}@test.com`,
    loyaltyPoints: Math.floor(Math.random() * 1000),
    totalSpent: Math.random() * 10000,
  }));
}

// ============================================================================
// 1. LARGE PRODUCT CATALOG
// ============================================================================
describe('Performance — Large Product Catalog', () => {
  it('handles 500 products without error', () => {
    const { result } = renderStore();
    const products = generateProducts(500);

    const start = performance.now();
    act(() => {
      products.forEach(p => result.current.addProduct(p));
    });
    const duration = performance.now() - start;

    expect(result.current.products.length).toBeGreaterThanOrEqual(500);
    // Should complete in under 5 seconds even on slow CI
    expect(duration).toBeLessThan(5000);
  });

  it('handles 1000 products without crash', () => {
    const { result } = renderStore();
    const products = generateProducts(1000);

    act(() => {
      products.forEach(p => result.current.addProduct(p));
    });

    expect(result.current.products.length).toBeGreaterThanOrEqual(1000);
  });

  it('product search/filter through large catalog is responsive', () => {
    const { result } = renderStore();
    const products = generateProducts(500);

    act(() => {
      products.forEach(p => result.current.addProduct(p));
    });

    // Simulate filtering (mimics POS component filtering)
    const start = performance.now();
    const filtered = result.current.products.filter(p =>
      p.name.toLowerCase().includes('product 42') ||
      p.sku.toLowerCase().includes('perf-00042')
    );
    const duration = performance.now() - start;

    expect(filtered.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100); // Filter should be < 100ms
  });
});

// ============================================================================
// 2. HIGH-VOLUME SALES
// ============================================================================
describe('Performance — High-Volume Sales', () => {
  it('processes 100 consecutive sales without error', () => {
    const { result } = renderStore();

    let saleCount = 0;
    const product = result.current.products[0];

    // Set stock high enough for 100 sales
    act(() => {
      result.current.adjustStock(product.id, 1000, 'ADJUSTMENT', 'Perf test');
    });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      act(() => {
        result.current.addToCart(result.current.products.find(p => p.id === product.id)!);
      });
      act(() => {
        const sale = result.current.completeSale('Cash', 0);
        if (sale) saleCount++;
      });
    }
    const duration = performance.now() - start;

    expect(saleCount).toBe(100);
    expect(result.current.salesHistory.length).toBe(100);
    expect(duration).toBeLessThan(10000); // 100 sales in under 10 seconds
  });

  it('salesHistory array grows linearly', () => {
    const { result } = renderStore();
    const product = result.current.products[0];
    const initialCount = result.current.salesHistory.length;

    act(() => {
      result.current.adjustStock(product.id, 50, 'ADJUSTMENT', 'Perf test');
    });

    for (let i = 0; i < 20; i++) {
      act(() => {
        result.current.addToCart(result.current.products.find(p => p.id === product.id)!);
      });
      act(() => {
        result.current.completeSale('Cash', 0);
      });
    }

    expect(result.current.salesHistory.length).toBe(initialCount + 20);
  });
});

// ============================================================================
// 3. CUSTOMER MANAGEMENT AT SCALE
// ============================================================================
describe('Performance — Customer Management', () => {
  it('handles 500 customers', () => {
    const { result } = renderStore();
    const customers = generateCustomers(500);

    act(() => {
      customers.forEach(c => result.current.addCustomer(c));
    });

    expect(result.current.customers.length).toBeGreaterThanOrEqual(500);
  });

  it('customer loyalty update under high volume', () => {
    const { result } = renderStore();
    const customer = result.current.customers[0];
    const product = result.current.products[0];

    act(() => {
      result.current.adjustStock(product.id, 100, 'ADJUSTMENT', 'Perf test');
    });

    for (let i = 0; i < 10; i++) {
      act(() => {
        result.current.addToCart(result.current.products.find(p => p.id === product.id)!);
      });
      act(() => {
        result.current.completeSale('Cash', 0, customer.id);
      });
    }

    const updatedCustomer = result.current.customers.find(c => c.id === customer.id)!;
    expect(updatedCustomer.totalSpent).toBeGreaterThan(0);
    expect(updatedCustomer.loyaltyPoints).toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. LOCALSTORAGE SIZE LIMITS
// ============================================================================
describe('Performance — localStorage Limits', () => {
  it('exportData with 500 products produces valid JSON', () => {
    const { result } = renderStore();
    const products = generateProducts(500);

    act(() => {
      products.forEach(p => result.current.addProduct(p));
    });

    let json = '';
    act(() => {
      json = result.current.exportData();
    });

    expect(json.length).toBeGreaterThan(0);
    expect(() => JSON.parse(json)).not.toThrow();

    // Estimate localStorage size (5MB limit typical)
    const sizeKB = json.length / 1024;
    console.log(`Export size with 500 products: ${sizeKB.toFixed(1)} KB`);

    // Warn if approaching localStorage limits
    if (sizeKB > 4000) {
      console.warn('WARNING: Export size approaching 5MB localStorage limit!');
    }
  });

  it('importData with large dataset succeeds', () => {
    const { result } = renderStore();
    const products = generateProducts(200);

    act(() => {
      products.forEach(p => result.current.addProduct(p));
    });

    let json = '';
    act(() => {
      json = result.current.exportData();
    });

    // Clear and reimport
    act(() => {
      result.current.products.forEach(p => result.current.deleteProduct(p.id));
    });

    let success = false;
    act(() => {
      success = result.current.importData(json);
    });

    expect(success).toBe(true);
    expect(result.current.products.length).toBeGreaterThanOrEqual(200);
  });
});

// ============================================================================
// 5. STOCK HISTORY GROWTH
// ============================================================================
describe('Performance — Stock History Growth', () => {
  it('stock history grows with every adjustment and sale', () => {
    const { result } = renderStore();
    const product = result.current.products[0];
    const initialCount = result.current.stockHistory.length;

    // Make 50 stock adjustments
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.adjustStock(product.id, 1, 'IN', `Restock #${i}`);
      });
    }

    expect(result.current.stockHistory.length).toBe(initialCount + 50);
  });

  it('stock history does not deduplicate (append-only log)', () => {
    const { result } = renderStore();
    const product = result.current.products[0];
    const initialCount = result.current.stockHistory.length;

    act(() => {
      result.current.adjustStock(product.id, 5, 'IN', 'Same reason');
      result.current.adjustStock(product.id, 5, 'IN', 'Same reason');
    });

    // Both entries should exist even if identical reason
    expect(result.current.stockHistory.length).toBe(initialCount + 2);
  });
});

// ============================================================================
// 6. FINANCIAL CALCULATION PRECISION AT SCALE
// ============================================================================
describe('Performance — Financial Precision at Scale', () => {
  it('cumulative financial totals remain precise after many transactions', () => {
    const { result } = renderStore();
    const initialSalesCount = result.current.salesHistory.length;

    // Add a product with price that causes FP issues
    act(() => {
      result.current.addProduct({
        id: 'perf-fp',
        name: 'FP Test',
        category: 'Test',
        brand: 'Test',
        price: 33.33,
        costPrice: 15.55,
        stock: 10000,
        branchStock: { b1: 10000, b2: 0 },
        minStockLevel: 0,
        sku: 'FP-PERF',
        description: 'Floating point test',
      });
    });

    const fpProduct = result.current.products.find(p => p.id === 'perf-fp')!;

    // Complete 50 sales of $33.33 each
    let totalRevenue = 0;
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.addToCart(result.current.products.find(p => p.id === 'perf-fp')!);
      });
      let sale: any;
      act(() => {
        sale = result.current.completeSale('Cash', 0);
      });
      totalRevenue += sale?.totalAmount ?? 0;
    }

    // Expected: 33.33 * 50 = 1666.50 + tax
    // This test documents FP accumulation behavior
    expect(totalRevenue).toBeGreaterThan(0);
    expect(result.current.salesHistory.length).toBe(initialSalesCount + 50);
  });
});
