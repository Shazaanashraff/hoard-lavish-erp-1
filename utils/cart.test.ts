import { describe, it, expect } from 'vitest';
import { calculateCartTotals } from './cart';
import { CartItem, Product } from '../types';

describe('Cart Utility', () => {
    const dummyProduct1: Product = {
        id: 'p1',
        name: 'Test Product 1',
        sku: 'SKU1',
        category: 'c1',
        brand: 'b1',
        description: 'd1',
        price: 100,
        costPrice: 50,
        stock: 10,
        minStockLevel: 5,
        branchStock: { 'b1': 10 }
    };

    const dummyProduct2: Product = {
        id: 'p2',
        name: 'Test Product 2',
        sku: 'SKU2',
        category: 'c1',
        brand: 'b1',
        description: 'd2',
        price: 200,
        costPrice: 150,
        stock: 5,
        minStockLevel: 2,
        branchStock: { 'b1': 5 }
    };

    const cart: CartItem[] = [
        { ...dummyProduct1, quantity: 2 }, // price: 200, cost: 100
        { ...dummyProduct2, quantity: 1 }  // price: 200, cost: 150
    ];

    describe('calculateCartTotals', () => {
        it('should calculate subtotal and total cost correctly', () => {
            const totals = calculateCartTotals(cart, 0, 0);
            expect(totals.subtotal).toBe(400); // 2*100 + 1*200
            expect(totals.totalCost).toBe(250); // 2*50 + 1*150
            expect(totals.tax).toBe(0);
            expect(totals.discount).toBe(0);
            expect(totals.total).toBe(400);
        });

        it('should correctly apply tax', () => {
            const totals = calculateCartTotals(cart, 0, 0.10); // 10% tax
            expect(totals.subtotal).toBe(400);
            expect(totals.tax).toBe(40);
            expect(totals.total).toBe(440);
        });

        it('should correctly apply a fixed discount', () => {
            const totals = calculateCartTotals(cart, 50, 0);
            expect(totals.subtotal).toBe(400);
            expect(totals.discount).toBe(50);
            expect(totals.total).toBe(350);
        });

        it('should cap discount so total is not negative', () => {
            // subtotal is 400
            const totals = calculateCartTotals(cart, 500, 0);
            expect(totals.discount).toBe(400);
            expect(totals.total).toBe(0);
        });

        it('should return 0s for an empty cart', () => {
            const totals = calculateCartTotals([], 0, 0);
            expect(totals.subtotal).toBe(0);
            expect(totals.tax).toBe(0);
            expect(totals.discount).toBe(0);
            expect(totals.total).toBe(0);
            expect(totals.totalCost).toBe(0);
        });
    });
});
