-- ============================================================
-- Enable Supabase Realtime for key tables
-- This allows cross-device sync via postgres_changes events
-- Run this in the Supabase SQL Editor (supabase.com dashboard)
-- ============================================================

-- REPLICA IDENTITY FULL is required so Realtime can broadcast
-- the full row data on UPDATE and DELETE events.
-- Uses DO blocks so missing tables are skipped gracefully.
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','product_branch_stock','customers','sales','sale_items',
    'stock_movements','categories','brands','suppliers','supplier_transactions',
    'expenses','branches','damaged_goods'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;

-- Add tables to the supabase_realtime publication
-- (Supabase Realtime only tracks tables in this publication)
-- Uses DO blocks so missing tables are skipped gracefully instead of failing.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_branch_stock') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_branch_stock;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE customers;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sale_items;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_movements') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'categories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE categories;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'brands') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE brands;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branches') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE branches;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'damaged_goods') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE damaged_goods;
  END IF;
END $$;
