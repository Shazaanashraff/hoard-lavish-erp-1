import { CUR } from '../constants';

/**
 * Formats a number as currency.
 * Uses en-US locale and ensures exactly 2 decimal places.
 */
export const fmtCurrency = (n: number | undefined | null): string => {
    if (n === undefined || n === null || isNaN(n)) {
        n = 0;
    }
    return `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
