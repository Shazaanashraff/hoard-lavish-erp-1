const CUR = 'LKR';

export const fmtCurrency = (n: number): string =>
  `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
