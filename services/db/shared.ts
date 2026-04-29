// Shared utilities for the DB layer — not exported outside services/db/
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value?: string): boolean => !!value && UUID_PATTERN.test(value);
export const asUuidOrNull = (value?: string): string | null => (value && UUID_PATTERN.test(value) ? value : null);

export type SupabaseErrorLike = {
    code?: string;
    status?: number;
    message?: string;
    details?: string;
    hint?: string;
};
