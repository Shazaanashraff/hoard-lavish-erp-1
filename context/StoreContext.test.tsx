import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StoreProvider, useStore } from './StoreContext';
import { Product, Branch } from '../types';

// Mock Supabase service
vi.mock('../services/supabaseService', () => ({
    fetchBranches: vi.fn(() => Promise.resolve([])),
    insertBranch: vi.fn(() => Promise.resolve()),
    fetchProductsWithStock: vi.fn(() => Promise.resolve([])),
    insertProduct: vi.fn(() => Promise.resolve()),
    fetchCustomers: vi.fn(() => Promise.resolve([])),
    fetchSales: vi.fn(() => Promise.resolve([])),
    fetchStockMovements: vi.fn(() => Promise.resolve([])),
    fetchSuppliers: vi.fn(() => Promise.resolve([])),
    fetchSupplierTransactions: vi.fn(() => Promise.resolve([])),
    fetchExpenses: vi.fn(() => Promise.resolve([])),
    fetchUsers: vi.fn(() => Promise.resolve([])),
    fetchSettings: vi.fn(() => Promise.resolve([])),
    fetchCategories: vi.fn(() => Promise.resolve([])),
    fetchBrands: vi.fn(() => Promise.resolve([])),
    fetchDamagedGoods: vi.fn(() => Promise.resolve([])),
}));

describe('StoreContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <StoreProvider>{children}</StoreProvider>
    );

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            const msg = args[0];
            if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
            if (typeof msg === 'string' && msg.includes('Import failed')) return;
            // You can log other errors if needed, or suppress them all
        });
    });

    describe('Cart stock level checks', () => {
        it('should prevent overselling by returning an error message if stock is insufficient', () => {
            const { result } = renderHook(() => useStore(), { wrapper });

            let branchId = '';
            let addMsg = '';

            act(() => {
                const testBranch: Branch = { id: 'b1', name: 'Main', address: '1', phone: '1' };
                result.current.addBranch(testBranch);
                branchId = testBranch.id;
            });

            const product: Product = {
                id: 'p1',
                name: 'Item',
                category: 'c1',
                brand: 'b1',
                sku: '1',
                description: 'desc',
                price: 10,
                costPrice: 5,
                stock: 2,
                minStockLevel: 1,
                branchStock: { [branchId]: 2 }
            };

            act(() => {
                result.current.addProduct(product);
                result.current.setBranch(branchId);
            });

            // Add item first time (success)
            act(() => {
                addMsg = result.current.addToCart(product);
            });
            expect(addMsg).toBe('ok');

            // Add item second time (success)
            act(() => {
                addMsg = result.current.addToCart(product);
            });
            expect(addMsg).toBe('ok');

            // Add item third time (fail, overselling)
            act(() => {
                addMsg = result.current.addToCart(product);
            });
            expect(addMsg).toContain('Insufficient stock');
            expect(result.current.cart.find(c => c.id === 'p1')?.quantity).toBe(2);
        });
    });

    describe('Import/Export Data Serialization', () => {
        it('should export data as a JSON string', () => {
            const { result } = renderHook(() => useStore(), { wrapper });
            const dataStr = result.current.exportData();
            expect(typeof dataStr).toBe('string');

            const data = JSON.parse(dataStr);
            expect(data).toHaveProperty('products');
            expect(data).toHaveProperty('branches');
            expect(data).toHaveProperty('salesHistory');
        });

        it('should import data correctly from JSON string', () => {
            const { result } = renderHook(() => useStore(), { wrapper });

            const newBranch = { id: 'test-branch', name: 'Imported', address: '', phone: '', type: 'Main' };
            const testData = {
                products: [{ id: '1', name: 'Imported Product' }],
                branches: [newBranch]
            };

            let success = false;
            act(() => {
                success = result.current.importData(JSON.stringify(testData));
            });

            expect(success).toBe(true);
            expect(result.current.products.length).toBe(1);
            expect(result.current.branches[0].id).toBe('test-branch');
        });

        it('should return false when importing invalid JSON', () => {
            const { result } = renderHook(() => useStore(), { wrapper });

            let success = true;
            act(() => {
                success = result.current.importData('invalid json');
            });

            expect(success).toBe(false);
        });
    });
});
