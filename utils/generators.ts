/**
 * Generates a unique invoice number.
 * Format: INV-{6-digit-timestamp}
 *
 * @returns Generated invoice number string
 */
export const generateInvoiceNumber = (): string => {
    return `INV-${Date.now().toString().slice(-6)}`;
};
