-- Persist whether a supplier transaction should affect accounting reports.
-- Existing supplier payments are excluded from day-end reports by default.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'supplier_transactions'
  ) THEN
    ALTER TABLE supplier_transactions
      ADD COLUMN IF NOT EXISTS affects_accounting BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE supplier_transactions
    SET affects_accounting = FALSE
    WHERE affects_accounting IS NULL;
  END IF;
END $$;
