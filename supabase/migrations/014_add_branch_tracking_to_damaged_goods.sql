-- ============================================================
-- Migration 014: Track branch for damaged goods
-- ============================================================

ALTER TABLE damaged_goods
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS branch_name TEXT;

CREATE INDEX IF NOT EXISTS idx_damaged_goods_branch_id ON damaged_goods(branch_id);
