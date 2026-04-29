export type DbLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  error_description?: string;
};

export const isLikelyConnectivityIssue = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  if (err instanceof Error) {
    const msg = (err.message || '').toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('fetch failed') ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('offline')
    ) return true;
  }

  if (err && typeof err === 'object') {
    const dbErr = err as DbLikeError;
    const msg = `${dbErr.message || ''} ${dbErr.error_description || ''}`.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('offline')
    ) return true;
  }

  return false;
};

export const extractDbErrorMessage = (
  err: unknown,
  fallback = 'Database operation failed',
  operation: 'checkout' | 'general' = 'general'
): string => {
  if (isLikelyConnectivityIssue(err)) {
    return operation === 'checkout'
      ? 'Checkout failed due to an internet connection issue. Please check your connection and try again.'
      : 'Database request failed due to an internet connection issue. Please check your connection and try again.';
  }

  if (err instanceof Error && err.message) return err.message;

  if (err && typeof err === 'object') {
    const dbErr = err as DbLikeError;
    const code = dbErr.code || '';
    const message = dbErr.message || dbErr.error_description || '';
    const details = dbErr.details || '';
    const hint = dbErr.hint || '';
    const combined = `${message} ${details} ${hint}`.toLowerCase();

    if (combined.includes('<!doctype html') || combined.includes('cloudflare') || combined.includes('error code 502') || combined.includes('bad gateway')) {
      return operation === 'checkout'
        ? 'Checkout could not reach the backend service right now. Please try again.'
        : 'The backend service returned an error response. Please try again.';
    }

    if (combined.includes('affects_accounting') && combined.includes('schema cache')) {
      return operation === 'checkout'
        ? 'Checkout failed because the database schema is out of date. Refresh the Supabase schema cache or apply the latest migration.'
        : 'The database schema is out of date for supplier transactions. Refresh the Supabase schema cache or apply the latest migration.';
    }

    if (code === '23503') {
      if ((message + details).toLowerCase().includes('product_branch_stock')) {
        return operation === 'checkout'
          ? 'Checkout failed because related stock data is missing or invalid (not an internet connection issue).'
          : 'Cannot add product stock for one or more branches. Please sync branches and try again (not an internet connection issue).';
      }
      return operation === 'checkout'
        ? 'Checkout failed because related data is missing or invalid (not an internet connection issue).'
        : 'This action failed because related data is missing or invalid (not an internet connection issue).';
    }
    if (code === '22P02') {
      return operation === 'checkout'
        ? 'Checkout failed because invalid data format was sent to the database (not an internet connection issue).'
        : 'Invalid value format was sent to the database (not an internet connection issue).';
    }
    if (code === '23505') return 'A record with the same value already exists (not an internet connection issue).';
    if (code === '42501') return 'Permission denied for this database action (not an internet connection issue).';
    if (code === '23502') return 'A required field is missing for this database action (not an internet connection issue).';

    if (message) {
      const parts = [message];
      if (details) parts.push(details);
      if (hint) parts.push(`Hint: ${hint}`);
      const merged = parts.join(' - ');
      return operation === 'checkout'
        ? `Checkout failed (not an internet connection issue): ${merged}`
        : `${merged} (not an internet connection issue).`;
    }
  }

  return operation === 'checkout'
    ? `${fallback} (not an internet connection issue).`
    : `${fallback} (not an internet connection issue).`;
};
