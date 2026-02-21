import { describe, it, expect } from 'vitest';
import { fmtCurrency } from './formatters';
import { CUR } from '../constants';

describe('Formatters Utility', () => {
    describe('fmtCurrency', () => {
        it('should format a standard positive number correctly', () => {
            // 1000 -> "CUR 1,000.00"
            expect(fmtCurrency(1000)).toBe(`${CUR} 1,000.00`);
            expect(fmtCurrency(1234.56)).toBe(`${CUR} 1,234.56`);
        });

        it('should format zero correctly', () => {
            expect(fmtCurrency(0)).toBe(`${CUR} 0.00`);
        });

        it('should format a negative number correctly', () => {
            expect(fmtCurrency(-500.25)).toBe(`${CUR} -500.25`);
        });

        it('should handle undefined and null inputs by treating them as 0', () => {
            expect(fmtCurrency(undefined as any)).toBe(`${CUR} 0.00`);
            expect(fmtCurrency(null as any)).toBe(`${CUR} 0.00`);
        });

        it('should handle NaN by treating it as 0', () => {
            expect(fmtCurrency(NaN)).toBe(`${CUR} 0.00`);
        });
    });
});
