import { CartItem } from '../types';

export interface CartTotals {
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    totalCost: number;
}

/**
 * Calculates cart totals including subtotal, tax, discount, total, and totalCost.
 * Supports a simple fixed discount currently.
 *
 * @param cart Array of cart items
 * @param discount Fixed discount amount to apply
 * @param taxRate Optional tax rate percentage (e.g. 0.1 for 10%), default is 0
 * @returns Object containing calculated totals
 */
export const calculateCartTotals = (
    cart: CartItem[],
    discount: number = 0,
    taxRate: number = 0
): CartTotals => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalCost = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);

    // Tax logic (can be expanded later, default to 0 for now as per POS.tsx)
    const tax = subtotal * taxRate;

    // Ensure we don't apply discount that makes the total negative
    const effectiveDiscount = Math.min(discount, subtotal + tax);

    const total = subtotal + tax - effectiveDiscount;

    return {
        subtotal,
        tax,
        discount: effectiveDiscount,
        total,
        totalCost
    };
};
