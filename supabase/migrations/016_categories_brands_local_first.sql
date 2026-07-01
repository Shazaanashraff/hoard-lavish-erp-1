-- ========================
-- CATEGORIES & BRANDS: local-first support
-- Adds timestamps needed for last-write-wins conflict resolution between
-- the Electron local cache and Supabase, soft-delete (tombstone) support,
-- and atomic rename RPCs that cascade to products/expenses.
-- ========================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Atomic rename + cascade: category name propagates to products.category and expenses.category
CREATE OR REPLACE FUNCTION fn_rename_category(p_old_name TEXT, p_new_name TEXT)
RETURNS categories AS $$
DECLARE
  v_row categories;
BEGIN
  IF p_old_name = p_new_name THEN
    SELECT * INTO v_row FROM categories WHERE name = p_old_name;
    RETURN v_row;
  END IF;

  UPDATE categories SET name = p_new_name, updated_at = now()
    WHERE name = p_old_name AND deleted_at IS NULL
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category % not found or deleted', p_old_name;
  END IF;

  UPDATE products SET category = p_new_name WHERE category = p_old_name;
  UPDATE expenses SET category = p_new_name WHERE category = p_old_name;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- Atomic rename + cascade: brand name propagates to products.brand only (no expenses.brand column)
CREATE OR REPLACE FUNCTION fn_rename_brand(p_old_name TEXT, p_new_name TEXT)
RETURNS brands AS $$
DECLARE
  v_row brands;
BEGIN
  IF p_old_name = p_new_name THEN
    SELECT * INTO v_row FROM brands WHERE name = p_old_name;
    RETURN v_row;
  END IF;

  UPDATE brands SET name = p_new_name, updated_at = now()
    WHERE name = p_old_name AND deleted_at IS NULL
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand % not found or deleted', p_old_name;
  END IF;

  UPDATE products SET brand = p_new_name WHERE brand = p_old_name;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;
