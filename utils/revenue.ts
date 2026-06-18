type LeanSaleForStats = {
  totalAmount: number;
  items: { id: string; name: string; price: number; quantity: number }[];
};

export type ProductRevenueStat = {
  name: string;
  revenue: number;
  quantity: number;
};

export const buildProductRevenueStats = (sales: LeanSaleForStats[]): Map<string, ProductRevenueStat> => {
  const stats = new Map<string, ProductRevenueStat>();

  sales.forEach(sale => {
    if (!sale.items.length) return;

    const grossItemTotal = sale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const fallbackShare = 1 / sale.items.length;

    sale.items.forEach(item => {
      const current = stats.get(item.id) || { name: item.name, revenue: 0, quantity: 0 };
      const itemGross = item.price * item.quantity;
      const share = grossItemTotal > 0 ? itemGross / grossItemTotal : fallbackShare;
      const allocatedRevenue = sale.totalAmount * share;

      stats.set(item.id, {
        name: item.name,
        revenue: current.revenue + allocatedRevenue,
        quantity: current.quantity + item.quantity,
      });
    });
  });

  return stats;
};

export const getTopRevenueAndQuantityProducts = (sales: LeanSaleForStats[]) => {
  const stats = buildProductRevenueStats(sales);

  let bestRev = { name: 'No Sales Yet', value: 0 };
  let bestQty = { name: 'No Sales Yet', value: 0 };

  stats.forEach(val => {
    if (val.revenue > bestRev.value) bestRev = { name: val.name, value: val.revenue };
    if (val.quantity > bestQty.value) bestQty = { name: val.name, value: val.quantity };
  });

  return { bestRev, bestQty };
};