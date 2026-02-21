import { describe, it, expect } from 'vitest';
import {
    mapProduct,
    mapCustomer,
    mapSale,
    mapStockMovement,
    mapSupplier,
    mapSupplierTransaction,
    mapExpense,
    mapUser,
    mapSettings
} from './supabaseService';

describe('Supabase Service Data Mappers', () => {
    it('should map flat DB row to Product object', () => {
        const dbRow = {
            id: 'prod-1',
            name: 'Item A',
            sku: 'SKU-01',
            barcode: 'B-123',
            category_id: 'cat-1',
            category_name: 'Category 1',
            price: 100.5,
            cost_price: 50.0,
            min_stock_level: 10,
            image_url: 'http://img.com/1',
            stock_by_branch: { b1: 15, b2: 20 }
        };

        const product = mapProduct(dbRow);

        expect(product).toEqual({
            id: 'prod-1',
            name: 'Item A',
            sku: 'SKU-01',
            category: undefined,
            brand: undefined,
            price: 100.5,
            costPrice: 50.0,
            stock: 0,
            minStockLevel: 10,
            imageUrl: 'http://img.com/1',
            branchStock: {},
            color: '',
            size: '',
            description: undefined
        });
    });

    it('should handle null fields in mapProduct', () => {
        const dbRow = { id: 'p2', name: 'N', sku: 'S', price: 10, cost_price: 5, stock_by_branch: null };
        const p = mapProduct(dbRow);
        expect(p.category).toBeUndefined();
        expect(p.branchStock).toEqual({});
    });

    it('should map flat DB row to Customer object', () => {
        const dbRow = { id: 'c1', name: 'Cust A', phone: '1234', address: '123 St', loyalty_points: 50, total_spent: 1000 };
        const customer = mapCustomer(dbRow);
        expect(customer).toEqual({
            id: 'c1', name: 'Cust A', phone: '1234', email: undefined,
            loyaltyPoints: 50, totalSpent: 1000
        });
    });

    it('should map flat DB row to SalesRecord object', () => {
        const dbRow = {
            id: 's1',
            invoice_number: 'INV-123',
            date: '2023-01-01',
            customer_id: 'c1',
            customer_name: 'Cust',
            branch_id: 'b1',
            branch_name: 'Branch 1',
            items: [{ id: 'i1', price: 10, quantity: 1, costPrice: 5 }],
            subtotal: 10,
            discount: 0,
            tax: 0,
            total_amount: 10,
            total_cost: 5,
            payment_method: 'CASH',
            amount_paid: 10,
            change_due: 0
        };
        const sale = mapSale(dbRow);
        expect(sale.id).toBe('s1');
        expect(sale.invoiceNumber).toBe('INV-123');
        expect(sale.totalAmount).toBe(10);
        expect(sale.paymentMethod).toBe('CASH');
        expect(sale.items.length).toBe(1);
        expect(sale.customerName).toBe('Cust');
    });

    it('should map flat DB row to Supplier object', () => {
        const dbRow = { id: 'sup1', name: 'Sup1', address: 'addr1', phone: '123', email: 'e@e.com', contact_person: 'p' };
        const supplier = mapSupplier(dbRow);
        expect(supplier.id).toBe('sup1');
        expect(supplier.name).toBe('Sup1');
    });

    it('should map flat DB row to User object', () => {
        const dbRow = { id: 'u1', name: 'User 1', role: 'ADMIN', pin: '1234' };
        const user = mapUser(dbRow);
        expect(user.id).toBe('u1');
        expect(user.role).toBe('ADMIN');
        expect(user.branchId).toBeUndefined();
    });
});
