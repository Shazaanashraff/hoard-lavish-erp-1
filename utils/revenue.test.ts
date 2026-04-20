import { describe, it, expect } from 'vitest';
import { buildProductRevenueStats } from './revenue';
import { makeSale, cartItemGown, cartItemLoafers } from '../tests/fixtures/data';

describe('revenue allocation', () => {
  it('uses the sale total for a single-item sale instead of the raw line total', () => {
    const sale = makeSale({
      items: [{ ...cartItemGown, quantity: 3, price: 2790 }],
      subtotal: 8370,
      discount: 1380,
      tax: 0,
      totalAmount: 6990,
      totalCost: 1800,
    });

    const stats = buildProductRevenueStats([sale]);
    expect(stats.get(cartItemGown.id)?.revenue).toBeCloseTo(6990, 2);
    expect(stats.get(cartItemGown.id)?.quantity).toBe(3);
  });

  it('distributes a discounted sale total across items proportionally', () => {
    const sale = makeSale({
      items: [cartItemGown, { ...cartItemLoafers, quantity: 1 }],
      subtotal: 1600,
      discount: 100,
      tax: 0,
      totalAmount: 1500,
      totalCost: 750,
    });

    const stats = buildProductRevenueStats([sale]);
    const totalRevenue = Array.from(stats.values()).reduce((sum, item) => sum + item.revenue, 0);

    expect(totalRevenue).toBeCloseTo(1500, 2);
    expect(stats.get(cartItemGown.id)?.revenue).toBeCloseTo(1171.875, 3);
    expect(stats.get(cartItemLoafers.id)?.revenue).toBeCloseTo(328.125, 3);
  });
});