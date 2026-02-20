-- ============================================================
-- Migration 002: Inventory color/size + Damaged Goods table
-- Run this in the Supabase SQL Editor AFTER 001_initial_schema.sql
-- ============================================================

-- ========================
-- 1. Add color & size columns to products
-- ========================
ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT '';

-- ========================
-- 2. Recreate the view to include the new columns
-- ========================
CREATE OR REPLACE VIEW v_products_with_stock AS
SELECT
  p.*,
  COALESCE(SUM(pbs.quantity), 0)::INT AS total_stock,
  COALESCE(
    jsonb_object_agg(pbs.branch_id::TEXT, pbs.quantity) FILTER (WHERE pbs.branch_id IS NOT NULL),
    '{}'::jsonb
  ) AS branch_stock
FROM products p
LEFT JOIN product_branch_stock pbs ON pbs.product_id = p.id
GROUP BY p.id;

-- ========================
-- 3. Damaged Goods table
-- ========================
CREATE TABLE IF NOT EXISTS damaged_goods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 4. RLS for damaged_goods
-- ========================
ALTER TABLE damaged_goods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON damaged_goods FOR ALL USING (true) WITH CHECK (true);
