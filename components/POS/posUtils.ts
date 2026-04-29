import type { ExchangeLineItem } from '../../types';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const allocateDiscountByUnits = (totalDiscount: number, totalUnits: number): number[] => {
  if (totalUnits <= 0 || totalDiscount <= 0) return Array.from({ length: totalUnits }, () => 0);
  const base = round2(totalDiscount / totalUnits);
  const shares = Array.from({ length: totalUnits }, () => base);
  const allocated = round2(shares.reduce((sum, v) => sum + v, 0));
  const diff = round2(totalDiscount - allocated);
  if (shares.length > 0 && diff !== 0) {
    shares[shares.length - 1] = round2(Math.max(0, shares[shares.length - 1] + diff));
  }
  return shares;
};

export const getEffectiveLineTotal = (item: ExchangeLineItem, quantity: number): number => {
  const qty = Math.max(0, quantity);
  if (item.sourceType === 'no-sale-return') {
    return round2(Math.max(0, item.manualReturnUnitPrice ?? 0) * qty);
  }
  const unitItemDiscount = Math.max(0, item.unitItemDiscount ?? item.discount ?? 0);
  const unitBillDiscountShare = Math.max(0, item.unitBillDiscountShare ?? 0);
  const fallbackUnit = Math.max(0, item.price - unitItemDiscount - unitBillDiscountShare);
  return round2(Math.max(0, item.effectiveUnitPrice ?? fallbackUnit) * qty);
};
