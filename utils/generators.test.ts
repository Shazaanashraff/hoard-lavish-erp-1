import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateInvoiceNumber } from './generators';

describe('Generators Utility', () => {
    describe('generateInvoiceNumber', () => {
        beforeEach(() => {
            // Tell vitest we use mocked time
            vi.useFakeTimers();
        });

        afterEach(() => {
            // Restoring date after each test run
            vi.useRealTimers();
        });

        it('should generate an invoice number with the correct prefix', () => {
            const invoice = generateInvoiceNumber();
            expect(invoice.startsWith('INV-')).toBe(true);
        });

        it('should append the last 6 digits of the current timestamp', () => {
            // Mock the timestamp to a specific value
            // 1678886400000 is some date in timestamp format
            vi.setSystemTime(new Date(1678886400000));

            const invoice = generateInvoiceNumber();
            // Date.now().toString() for 1678886400000 is "1678886400000"
            // Last 6 digits are "400000"
            expect(invoice).toBe('INV-400000');
        });

        it('should be exactly 10 characters long (INV- + 6 digits)', () => {
            const invoice = generateInvoiceNumber();
            expect(invoice).toHaveLength(10);
            expect(invoice).toMatch(/^INV-\d{6}$/); // Match format exactly
        });
    });
});
