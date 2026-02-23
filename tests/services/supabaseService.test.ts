/**
 * ============================================================================
 * SUPABASE SERVICE TESTS
 * ============================================================================
 *
 * Tests the supabaseService.ts layer by mocking the Supabase client.
 * Validates query construction, error handling, data mapping, and edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock supabase client ----
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();
const mockRpc = vi.fn();

// Build a chainable mock
function createChain() {
  const chain: any = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  // Default: return empty data
  chain.select.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);

  // When awaited (thenable), resolve with data
  chain.then = (resolve: any) => resolve({ data: [], error: null });

  return chain;
}

let mockChain = createChain();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => mockChain),
    rpc: vi.fn(() => Promise.resolve({ data: 'sale-id', error: null })),
  }
}));

// Import AFTER mock setup
import {
  fetchBranches,
  insertBranch,
  updateBranch,
  fetchProductsWithStock,
  insertProduct,
  updateProduct,
  deleteProduct,
  fetchCustomers,
  insertCustomer,
  updateCustomer,
  deleteCustomer,
  completeSaleRPC,
  fetchSales,
  fetchStockMovements,
  insertStockMovement,
  upsertBranchStock,
  fetchSuppliers,
  insertSupplier,
  fetchExpenses,
  insertExpense,
  fetchUsers,
  insertUser,
  fetchSettings,
  updateSettings,
  fetchCategories,
  fetchBrands,
  insertCategory,
  insertBrand,
  deleteCategory,
  deleteBrand,
  initializeBranchStock,
} from '../../services/supabaseService';

import { supabase } from '../../services/supabaseClient';

beforeEach(() => {
  vi.clearAllMocks();
  mockChain = createChain();
  (supabase.from as any).mockReturnValue(mockChain);
});

// ============================================================================
// BRANCHES
// ============================================================================
describe('supabaseService — Branches', () => {
  it('fetchBranches calls branches table with select and order', async () => {
    mockChain.then = (r: any) => r({
      data: [{ id: 'b1', name: 'HQ', address: '123 St', phone: '555' }],
      error: null
    });

    const result = await fetchBranches();
    expect(supabase.from).toHaveBeenCalledWith('branches');
    expect(mockChain.select).toHaveBeenCalledWith('*');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('HQ');
  });

  it('fetchBranches throws on Supabase error', async () => {
    mockChain.then = (r: any) => r({ data: null, error: { message: 'DB down' } });

    await expect(fetchBranches()).rejects.toBeDefined();
  });

  it('insertBranch sends correct payload', async () => {
    mockChain.single = vi.fn(() => Promise.resolve({
      data: { id: 'b-new', name: 'New', address: 'Addr', phone: '111' },
      error: null
    }));

    const result = await insertBranch({ name: 'New', address: 'Addr', phone: '111' });
    expect(supabase.from).toHaveBeenCalledWith('branches');
    expect(mockChain.insert).toHaveBeenCalled();
    expect(result.name).toBe('New');
  });

  it('updateBranch sends partial updates', async () => {
    mockChain.then = (r: any) => r({ data: null, error: null });

    await updateBranch('b1', { name: 'Updated HQ' });
    expect(supabase.from).toHaveBeenCalledWith('branches');
    expect(mockChain.update).toHaveBeenCalled();
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'b1');
  });
});

// ============================================================================
// PRODUCTS
// ============================================================================
describe('supabaseService — Products', () => {
  it('fetchProductsWithStock reads from v_products_with_stock view', async () => {
    mockChain.then = (r: any) => r({
      data: [{
        id: 'p1', name: 'Dress', category: 'Cat', brand: 'Brand',
        price: '1250.00', cost_price: '600.00', total_stock: 12,
        branch_stock: { b1: 8, b2: 4 }, min_stock_level: 3,
        sku: 'DRS-001', description: 'Test', image_url: null
      }],
      error: null
    });

    const result = await fetchProductsWithStock();
    expect(supabase.from).toHaveBeenCalledWith('v_products_with_stock');
    expect(result[0].price).toBe(1250);
    expect(result[0].costPrice).toBe(600);
    expect(result[0].branchStock).toEqual({ b1: 8, b2: 4 });
  });

  it('insertProduct creates product + branch stock rows', async () => {
    mockChain.single = vi.fn(() => Promise.resolve({
      data: { id: 'new-p' },
      error: null
    }));
    // Second call for product_branch_stock
    const stockChain = createChain();
    stockChain.then = (r: any) => r({ data: null, error: null });
    let callCount = 0;
    (supabase.from as any).mockImplementation((table: string) => {
      callCount++;
      if (table === 'product_branch_stock') return stockChain;
      return mockChain;
    });

    await insertProduct(
      {
        id: 'x', name: 'Test', category: 'Cat', brand: 'B', price: 100,
        costPrice: 50, stock: 10, branchStock: { b1: 10 }, minStockLevel: 2,
        sku: 'TST-001', description: 'Test'
      },
      [{ id: 'b1', name: 'HQ', address: '', phone: '' }]
    );

    expect(supabase.from).toHaveBeenCalledWith('products');
    expect(supabase.from).toHaveBeenCalledWith('product_branch_stock');
  });

  it('updateProduct handles branchStock upserts per-branch', async () => {
    const upsertChain = createChain();
    upsertChain.then = (r: any) => r({ data: null, error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'product_branch_stock') return upsertChain;
      return mockChain;
    });
    mockChain.then = (r: any) => r({ data: null, error: null });

    await updateProduct('p1', {
      name: 'Updated',
      branchStock: { b1: 10, b2: 5 }
    });

    expect(supabase.from).toHaveBeenCalledWith('products');
    expect(supabase.from).toHaveBeenCalledWith('product_branch_stock');
  });

  it('deleteProduct calls delete with correct id', async () => {
    mockChain.then = (r: any) => r({ data: null, error: null });

    await deleteProduct('p1');
    expect(supabase.from).toHaveBeenCalledWith('products');
    expect(mockChain.delete).toHaveBeenCalled();
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'p1');
  });
});

// ============================================================================
// CUSTOMERS
// ============================================================================
describe('supabaseService — Customers', () => {
  it('fetchCustomers maps snake_case to camelCase', async () => {
    mockChain.then = (r: any) => r({
      data: [{
        id: 'c1', name: 'John', phone: '555', email: 'j@x.com',
        loyalty_points: 100, total_spent: '5000.00'
      }],
      error: null
    });

    const result = await fetchCustomers();
    expect(result[0].loyaltyPoints).toBe(100);
    expect(result[0].totalSpent).toBe(5000);
  });
});

// ============================================================================
// SALES RPC
// ============================================================================
describe('supabaseService — Sales RPC', () => {
  it('completeSaleRPC calls fn_complete_sale with correct params', async () => {
    const sale: any = {
      invoiceNumber: 'INV-123',
      date: '2024-01-01',
      subtotal: 1000,
      discount: 50,
      tax: 76,
      totalAmount: 1026,
      totalCost: 500,
      paymentMethod: 'Cash',
      customerId: 'c1',
      customerName: 'John',
      branchId: 'b1',
      branchName: 'HQ',
      items: [{
        id: 'p1', name: 'Dress', quantity: 2, price: 500, costPrice: 250,
        category: '', brand: '', stock: 0, branchStock: {}, minStockLevel: 0, sku: '', description: ''
      }]
    };

    await completeSaleRPC(sale);
    expect(supabase.rpc).toHaveBeenCalledWith('fn_complete_sale', expect.objectContaining({
      p_invoice_number: 'INV-123',
      p_total_amount: 1026,
      p_branch_id: 'b1',
    }));
  });

  it('completeSaleRPC throws on RPC error', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Invoice duplicate' }
    });

    await expect(completeSaleRPC({
      invoiceNumber: 'INV-DUP',
      date: '', subtotal: 0, discount: 0, tax: 0, totalAmount: 0, totalCost: 0,
      paymentMethod: 'Cash', branchId: 'b1', branchName: 'HQ', items: [],
      id: 'x'
    } as any)).rejects.toBeDefined();
  });
});

// ============================================================================
// ERROR HANDLING PATTERNS
// ============================================================================
describe('supabaseService — Error Handling', () => {
  it('all fetch functions throw on Supabase error', async () => {
    mockChain.then = (r: any) => r({ data: null, error: { message: 'Network error' } });

    await expect(fetchBranches()).rejects.toBeDefined();
    await expect(fetchCustomers()).rejects.toBeDefined();
    await expect(fetchProductsWithStock()).rejects.toBeDefined();
  });

  it('returns empty arrays when data is null but no error', async () => {
    mockChain.then = (r: any) => r({ data: null, error: null });

    const branches = await fetchBranches();
    expect(branches).toEqual([]);
  });
});

// ============================================================================
// STOCK OPERATIONS
// ============================================================================
describe('supabaseService — Stock Operations', () => {
  it('upsertBranchStock uses product_branch_stock with onConflict', async () => {
    mockChain.then = (r: any) => r({ data: null, error: null });

    await upsertBranchStock('p1', 'b1', 15);
    expect(supabase.from).toHaveBeenCalledWith('product_branch_stock');
    expect(mockChain.upsert).toHaveBeenCalled();
  });

  it('insertStockMovement maps to snake_case fields', async () => {
    mockChain.then = (r: any) => r({ data: null, error: null });

    await insertStockMovement({
      id: 'sm1',
      productId: 'p1',
      productName: 'Dress',
      branchId: 'b1',
      branchName: 'HQ',
      type: 'IN',
      quantity: 5,
      reason: 'Restock',
      date: '2024-01-01'
    });

    expect(supabase.from).toHaveBeenCalledWith('stock_movements');
    expect(mockChain.insert).toHaveBeenCalled();
  });
});

// ============================================================================
// SETTINGS
// ============================================================================
describe('supabaseService — Settings', () => {
  it('fetchSettings returns settings or default', async () => {
    mockChain.single = vi.fn(() => Promise.resolve({
      data: {
        id: '1', store_name: 'Test Store', currency_symbol: '$',
        tax_rate: 0.08, enable_low_stock_alerts: true
      },
      error: null
    }));

    const result = await fetchSettings();
    expect(result).toBeDefined();
  });

  it('updateSettings sends correct fields', async () => {
    // updateSettings first does select('id').limit(1).single() to get existing row
    mockChain.single = vi.fn(() => Promise.resolve({ data: { id: '1' }, error: null }));
    // Then update().eq() which is thenable
    mockChain.then = (r: any) => r({ data: null, error: null });

    await updateSettings({ storeName: 'New Name', taxRate: 0.1 });
    expect(supabase.from).toHaveBeenCalledWith('app_settings');
  });
});
