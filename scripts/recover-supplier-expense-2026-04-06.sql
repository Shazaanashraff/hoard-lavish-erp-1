-- Recovery script: create ONE missing supplier expense transaction from historical stock-in lines.
-- Safe: this script does NOT update stock tables.
-- Idempotent by reference: it will not insert again if the same reference already exists.

DO $$
DECLARE
  v_supplier_name TEXT := 'REPLACE_WITH_SUPPLIER_NAME';
  v_reference TEXT := 'RECOVERY-SUPPLIER-2026-04-06-ETHULKOTTE-01';
  v_txn_date TIMESTAMPTZ := '2026-04-06T00:00:00.000Z'::timestamptz;
  v_affects_accounting BOOLEAN := FALSE;

  v_supplier_id UUID;
  v_total NUMERIC(12,2);
  v_notes TEXT;
  v_has_affects_accounting BOOLEAN;
BEGIN
  -- 1) Ensure supplier exists (or create minimal supplier row)
  SELECT id
  INTO v_supplier_id
  FROM suppliers
  WHERE lower(name) = lower(v_supplier_name)
  ORDER BY created_at NULLS LAST
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (name, contact_person, phone, email, address)
    VALUES (v_supplier_name, '', '', '', '')
    RETURNING id INTO v_supplier_id;
  END IF;

  -- 2) Build item pricing from products.cost_price using provided stock lines
  WITH input_items(product_name, qty, detail) AS (
    VALUES
      ('ZYT - XL', 6, 'Size: XL'),
      ('KNITTED -XXL', 17, 'Size: XXL'),
      ('KNITTED -L', 10, 'Size: L'),
      ('HST POLO-XL', 9, 'Size: XL'),
      ('HST POLO -L', 9, 'Size: L'),
      ('KNITTED -XL', 18, 'Size: XL'),
      ('HST POLO -XXL', 9, 'Size: XXL'),
      ('ZYT - L', 3, 'Size: L'),
      ('HST POLO-M', 11, 'Size: M'),
      ('ZYT -XXXL', 13, 'Size: XXXL'),
      ('ZYT -XXL', 7, 'Size: XXL'),
      ('KNITTED -XXXL', 13, 'Size: XXXL')
  ),
  priced AS (
    SELECT
      i.product_name,
      i.qty,
      i.detail,
      p.cost_price::numeric(12,2) AS unit_price,
      (i.qty * p.cost_price)::numeric(12,2) AS line_total
    FROM input_items i
    JOIN products p
      ON lower(replace(p.name, ' ', '')) = lower(replace(i.product_name, ' ', ''))
  ),
  notes_lines AS (
    SELECT
      product_name,
      format(
        '- %s (%s) | Qty: %s | Stock In: +%s | Unit: LKR %s | Line: LKR %s',
        product_name,
        detail,
        qty,
        qty,
        to_char(unit_price, 'FM9999999990.00'),
        to_char(line_total, 'FM9999999990.00')
      ) AS line
    FROM priced
  )
  SELECT
    COALESCE((SELECT sum(line_total) FROM priced), 0)::numeric(12,2),
    (
      'Recovered supplier expense from historical stock adjustments. No stock was re-applied.' || E'\n' ||
      'Items Added:' || E'\n' ||
      COALESCE((SELECT string_agg(line, E'\n' ORDER BY product_name) FROM notes_lines), 'No item lines found')
    )
  INTO v_total, v_notes;

  -- 3) Validate all expected products were matched to prevent partial recovery
  IF (
    WITH input_items(product_name) AS (
      VALUES
        ('ZYT - XL'),
        ('KNITTED -XXL'),
        ('KNITTED -L'),
        ('HST POLO-XL'),
        ('HST POLO -L'),
        ('KNITTED -XL'),
        ('HST POLO -XXL'),
        ('ZYT - L'),
        ('HST POLO-M'),
        ('ZYT -XXXL'),
        ('ZYT -XXL'),
        ('KNITTED -XXXL')
    )
    SELECT count(*)
    FROM input_items i
    LEFT JOIN products p
      ON lower(replace(p.name, ' ', '')) = lower(replace(i.product_name, ' ', ''))
    WHERE p.id IS NULL
  ) > 0 THEN
    RAISE EXCEPTION 'Recovery aborted: one or more product names were not found in products table. Update names in script and retry.';
  END IF;

  -- 4) Insert supplier transaction if not already present by reference
  IF NOT EXISTS (SELECT 1 FROM supplier_transactions WHERE reference = v_reference) THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'supplier_transactions'
        AND column_name = 'affects_accounting'
    )
    INTO v_has_affects_accounting;

    IF v_has_affects_accounting THEN
      INSERT INTO supplier_transactions (
        supplier_id,
        supplier_name,
        date,
        amount,
        type,
        reference,
        notes,
        affects_accounting
      ) VALUES (
        v_supplier_id,
        v_supplier_name,
        v_txn_date,
        v_total,
        'PAYMENT'::supplier_txn_type,
        v_reference,
        v_notes,
        v_affects_accounting
      );
    ELSE
      INSERT INTO supplier_transactions (
        supplier_id,
        supplier_name,
        date,
        amount,
        type,
        reference,
        notes
      ) VALUES (
        v_supplier_id,
        v_supplier_name,
        v_txn_date,
        v_total,
        'PAYMENT'::supplier_txn_type,
        v_reference,
        v_notes
      );
    END IF;
  END IF;
END $$;
