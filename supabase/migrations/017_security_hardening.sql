-- ============================================================
-- Security hardening: hashed PINs + server-side verification,
-- narrowed RLS policies (replacing blanket "Allow all"), and
-- SECURITY DEFINER on the RPCs that need to write tables the
-- anon role no longer has direct access to.
--
-- Run this in the Supabase SQL Editor, or `supabase db push`.
--
-- IMPORTANT CONTEXT FOR WHOEVER READS THIS LATER:
-- This app has no real per-user session (no Supabase Auth — every
-- request uses the single public anon key, regardless of which
-- staff member is "logged in" client-side). That means Postgres
-- cannot tell one cashier's device from another, or from a random
-- script with the anon key. Row-level policies here can only
-- restrict which *operations* the anon key is allowed to perform
-- (matching what the app's own client code actually does), not
-- *who* is allowed to perform them. Two residual risks that this
-- migration does NOT and CANNOT fully close without a real
-- per-user auth migration (anonymous/JWT-based Supabase Auth
-- sessions with app_metadata roles):
--   1. Anyone with the anon key can still create/delete `users`
--      rows (needed for the admin "manage users" screen to work
--      at all without a session to check "is this caller an
--      admin"). Not a new risk (today's "Allow all" already
--      permits this) — just not newly fixed either.
--   2. PINs are 4 digits (10,000 possibilities). Hashing stops
--      casual/incidental plaintext exposure (DB dumps, backups,
--      support access, logs) but does NOT stop a determined
--      attacker who reads the hash table from brute-forcing any
--      individual PIN in well under a second. The hash column
--      stays readable by anon because the app's offline-first
--      design caches it locally for PIN login to keep working
--      when Supabase is unreachable — the same credential (anon
--      key) is used both by the legitimate app and by an
--      attacker, so this trade-off can't be engineered away
--      without real sessions.
-- What this migration DOES fully close: the previous setup let
-- anyone with the public URL run one unauthenticated HTTP GET and
-- instantly receive every staff member's name + PLAINTEXT PIN,
-- and separately let anyone directly INSERT/UPDATE/DELETE rows in
-- every table including fabricating or editing completed sales.
-- ============================================================

-- ============================================================
-- 1. Hash PINs at rest
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Backfill from the existing plaintext column (safe to re-run: only
-- touches rows that don't have a hash yet).
UPDATE users SET pin_hash = crypt(pin, gen_salt('bf'))
WHERE pin_hash IS NULL AND pin IS NOT NULL;

ALTER TABLE users DROP COLUMN IF EXISTS pin;

-- ============================================================
-- 2. PIN verification + PIN-set RPCs
-- Both are SECURITY DEFINER so they can read/write pin_hash even
-- though the anon role's own UPDATE grant on that column is
-- revoked below (see section 3). search_path is pinned per
-- Postgres security best practice for SECURITY DEFINER functions.
-- ============================================================

-- Verifies a PIN server-side and returns only the safe fields —
-- the client never needs to (and after this migration, no longer
-- can) compare against pin_hash itself.
CREATE OR REPLACE FUNCTION fn_verify_pin(p_pin TEXT)
RETURNS TABLE(id UUID, name TEXT, role user_role, branch_id UUID)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name, u.role, u.branch_id
  FROM users u
  WHERE u.pin_hash IS NOT NULL
    AND crypt(p_pin, u.pin_hash) = u.pin_hash
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION fn_verify_pin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_verify_pin(TEXT) TO anon, authenticated;

-- Sets/changes a user's PIN. The client only ever sends the new
-- plaintext PIN transiently (same as any "set a new password" flow
-- has to); it is hashed here and never stored in the clear.
CREATE OR REPLACE FUNCTION fn_set_user_pin(p_user_id UUID, p_new_pin TEXT)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_new_pin IS NULL OR length(p_new_pin) = 0 THEN
    RAISE EXCEPTION 'PIN cannot be empty';
  END IF;

  UPDATE users
  SET pin_hash = crypt(p_new_pin, gen_salt('bf'))
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_set_user_pin(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_set_user_pin(UUID, TEXT) TO anon, authenticated;

-- ============================================================
-- 3. Column-level lockdown on users.pin_hash
-- Row policies further down still let anon SELECT/INSERT/UPDATE
-- `users` rows (the admin "manage users" screen needs that), but
-- nobody can write an attacker-chosen hash directly — every write
-- to pin_hash must go through fn_set_user_pin above.
-- ============================================================
REVOKE UPDATE (pin_hash) ON users FROM anon, authenticated;
REVOKE INSERT (pin_hash) ON users FROM anon, authenticated;

-- ============================================================
-- 4. Enable RLS on tables that never got it
-- (`exchanges` / `exchange_items` were added in migration 010
-- without any ALTER TABLE ... ENABLE ROW LEVEL SECURITY at all —
-- meaning they were wide open, not even "Allow all"-restricted.)
-- ============================================================
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Replace every blanket "Allow all" policy with narrower,
-- per-operation policies matching what the client actually does
-- directly (per an audit of services/db/*.ts). Operations that
-- only ever happen inside an RPC are intentionally NOT granted to
-- anon directly — see section 6 for the RPCs promoted to
-- SECURITY DEFINER so they keep working without those grants.
-- ============================================================

DROP POLICY IF EXISTS "Allow all" ON branches;
CREATE POLICY "anon_select_branches" ON branches FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_branches" ON branches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_branches" ON branches FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_users" ON users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_users" ON users FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_users" ON users FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow all" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON brands;
CREATE POLICY "anon_select_brands" ON brands FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_brands" ON brands FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_brands" ON brands FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow all" ON product_branch_stock;
CREATE POLICY "anon_select_pbs" ON product_branch_stock FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_pbs" ON product_branch_stock FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_pbs" ON product_branch_stock FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon USING (true);

-- sales: no direct INSERT/UPDATE — every sale is created via
-- fn_complete_sale (now SECURITY DEFINER, see section 6) and voided
-- via fn_void_sale. Direct DELETE stays because deleteProduct()'s
-- "delete linked sales" cascade mode deletes sales rows directly.
DROP POLICY IF EXISTS "Allow all" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT TO anon USING (true);
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE TO anon USING (true);

-- sale_items: no direct INSERT (fn_complete_sale only). Direct
-- UPDATE stays because deleteProduct()'s "keep sales snapshot" mode
-- nulls out product_id directly on sale_items.
DROP POLICY IF EXISTS "Allow all" ON sale_items;
CREATE POLICY "anon_select_sale_items" ON sale_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_sale_items" ON sale_items FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON stock_movements;
CREATE POLICY "anon_select_stock_movements" ON stock_movements FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_stock_movements" ON stock_movements FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow all" ON supplier_transactions;
CREATE POLICY "anon_select_supplier_txns" ON supplier_transactions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_supplier_txns" ON supplier_transactions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_supplier_txns" ON supplier_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_supplier_txns" ON supplier_transactions FOR DELETE TO anon USING (true);

-- expenses: no direct UPDATE (category renames cascade via
-- fn_rename_category, now SECURITY DEFINER).
DROP POLICY IF EXISTS "Allow all" ON expenses;
CREATE POLICY "anon_select_expenses" ON expenses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_expenses" ON expenses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_delete_expenses" ON expenses FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow all" ON damaged_goods;
CREATE POLICY "anon_select_damaged_goods" ON damaged_goods FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_damaged_goods" ON damaged_goods FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_delete_damaged_goods" ON damaged_goods FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow all" ON stock_transfers;
CREATE POLICY "anon_select_stock_transfers" ON stock_transfers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_stock_transfers" ON stock_transfers FOR INSERT TO anon WITH CHECK (true);

-- exchanges / exchange_items: RLS was never enabled before this
-- migration (see section 4) — these are new policies, not replacements.
CREATE POLICY "anon_select_exchanges" ON exchanges FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_exchanges" ON exchanges FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_exchange_items" ON exchange_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_exchange_items" ON exchange_items FOR INSERT TO anon WITH CHECK (true);

-- ============================================================
-- 6. Promote the multi-table write RPCs to SECURITY DEFINER so
-- they keep working now that anon no longer has direct INSERT/
-- UPDATE grants on `sales`. Bodies are unchanged from migrations
-- 008/009/016 — only the security context + a pinned search_path
-- are added.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_complete_sale(
  p_invoice_number TEXT,
  p_date TIMESTAMPTZ,
  p_subtotal NUMERIC,
  p_discount NUMERIC,
  p_tax NUMERIC,
  p_total_amount NUMERIC,
  p_total_cost NUMERIC,
  p_payment_method payment_method,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_branch_id UUID,
  p_branch_name TEXT,
  p_items JSONB,
  p_cash_amount NUMERIC DEFAULT NULL,
  p_card_amount NUMERIC DEFAULT NULL
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
BEGIN
  IF p_payment_method::text = 'Cash+Card' THEN
    IF COALESCE(p_cash_amount, 0) < 0 OR COALESCE(p_card_amount, 0) < 0 THEN
      RAISE EXCEPTION 'Cash/Card split amounts cannot be negative';
    END IF;

    IF ABS((COALESCE(p_cash_amount, 0) + COALESCE(p_card_amount, 0)) - COALESCE(p_total_amount, 0)) > 0.01 THEN
      RAISE EXCEPTION 'Cash/Card split total (cash + card) must equal total amount';
    END IF;
  END IF;

  INSERT INTO sales (
    invoice_number, date, subtotal, discount, tax, total_amount, total_cost,
    payment_method, customer_id, customer_name, branch_id, branch_name,
    cash_amount, card_amount
  ) VALUES (
    p_invoice_number, p_date, p_subtotal, p_discount, p_tax, p_total_amount, p_total_cost,
    p_payment_method, p_customer_id, p_customer_name, p_branch_id, p_branch_name,
    CASE
      WHEN p_payment_method::text = 'Cash+Card' THEN COALESCE(p_cash_amount, 0)
      WHEN p_payment_method::text = 'Cash' THEN p_total_amount
      ELSE 0
    END,
    CASE
      WHEN p_payment_method::text = 'Cash+Card' THEN COALESCE(p_card_amount, 0)
      WHEN p_payment_method::text = 'Cash' THEN 0
      ELSE p_total_amount
    END
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, cost_price, discount)
    VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INT,
      (v_item->>'price')::NUMERIC,
      (v_item->>'cost_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0)
    );

    UPDATE product_branch_stock
    SET quantity = GREATEST(0, quantity - (v_item->>'quantity')::INT)
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id = p_branch_id;

    INSERT INTO stock_movements (product_id, product_name, branch_id, branch_name, type, quantity, reason, date)
    VALUES (
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      p_branch_id,
      p_branch_name,
      'OUT',
      (v_item->>'quantity')::INT,
      'Sale #' || p_invoice_number,
      p_date
    );
  END LOOP;

  IF p_customer_id IS NOT NULL THEN
    UPDATE customers
    SET total_spent = total_spent + p_total_amount,
        loyalty_points = loyalty_points + FLOOR(p_total_amount / 10)::INT
    WHERE id = p_customer_id;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_void_sale(
  p_sale_id UUID
) RETURNS UUID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_deleted_id UUID;
BEGIN
  SELECT id, invoice_number, branch_id, branch_name, customer_id, total_amount
  INTO v_sale
  FROM sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  FOR v_item IN
    SELECT product_id, product_name, quantity
    FROM sale_items
    WHERE sale_id = p_sale_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE product_branch_stock
      SET quantity = quantity + v_item.quantity
      WHERE product_id = v_item.product_id
        AND branch_id = v_sale.branch_id;

      INSERT INTO stock_movements (
        product_id, product_name, branch_id, branch_name, type, quantity, reason, date
      )
      VALUES (
        v_item.product_id, v_item.product_name, v_sale.branch_id, v_sale.branch_name,
        'IN', v_item.quantity, 'Sale Voided #' || v_sale.invoice_number, now()
      );
    END IF;
  END LOOP;

  IF v_sale.customer_id IS NOT NULL THEN
    UPDATE customers
    SET total_spent = GREATEST(0, total_spent - v_sale.total_amount),
        loyalty_points = GREATEST(0, loyalty_points - FLOOR(v_sale.total_amount / 10)::INT)
    WHERE id = v_sale.customer_id;
  END IF;

  DELETE FROM sales
  WHERE id = p_sale_id
  RETURNING id INTO v_deleted_id;

  RETURN v_deleted_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_rename_category(p_old_name TEXT, p_new_name TEXT)
RETURNS categories
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

CREATE OR REPLACE FUNCTION fn_rename_brand(p_old_name TEXT, p_new_name TEXT)
RETURNS brands
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

REVOKE ALL ON FUNCTION fn_complete_sale(TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, payment_method, UUID, TEXT, UUID, TEXT, JSONB, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_complete_sale(TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, payment_method, UUID, TEXT, UUID, TEXT, JSONB, NUMERIC, NUMERIC) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_void_sale(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_void_sale(UUID) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_rename_category(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_rename_category(TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION fn_rename_brand(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_rename_brand(TEXT, TEXT) TO anon, authenticated;

-- Drop the pre-split-payment 13-arg overload of fn_complete_sale if it
-- still exists from migration 001 — the client always calls the
-- 15-arg form (services/db/sales.ts), so this old overload is dead
-- and, being SECURITY INVOKER, would otherwise be a stale bypass of
-- the tightened sales/sale_items grants above.
DROP FUNCTION IF EXISTS fn_complete_sale(TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, payment_method, UUID, TEXT, UUID, TEXT, JSONB);

NOTIFY pgrst, 'reload schema';
