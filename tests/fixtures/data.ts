import type { CartItem, SalesRecord } from '../../types';

const baseProduct = {
  category: 'Clothing',
  brand: 'Hoard Lavish',
  stock: 10,
  branchStock: { b1: 10 },
  minStockLevel: 2,
  description: '',
  sku: '',
};

export const cartItemGown: CartItem = {
  ...baseProduct,
  id: 'prod-gown',
  name: 'Evening Gown',
  price: 1250,
  costPrice: 600,
  quantity: 1,
};

export const cartItemLoafers: CartItem = {
  ...baseProduct,
  id: 'prod-loafers',
  name: 'Leather Loafers',
  price: 350,
  costPrice: 150,
  quantity: 1,
};

type SaleOverrides = Partial<Pick<SalesRecord, 'items' | 'subtotal' | 'discount' | 'tax' | 'totalAmount' | 'totalCost'>>;

export function makeSale(overrides: SaleOverrides = {}): SalesRecord {
  return {
    id: 'sale-1',
    invoiceNumber: 'INV-001',
    date: '2026-04-01T00:00:00.000Z',
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    totalAmount: 0,
    totalCost: 0,
    paymentMethod: 'Cash',
    branchId: 'b1',
    branchName: 'Ethul Kotte',
    ...overrides,
  };
}
