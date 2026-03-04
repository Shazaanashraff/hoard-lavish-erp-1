-- ============================================================
-- Hoard Lavish ERP — Supabase Initial Schema Migration
-- Run this in the Supabase SQL Editor (supabase.com dashboard)
-- ============================================================

-- ========================
-- ENUM TYPES
-- ========================
CREATE TYPE user_role AS ENUM ('ADMIN', 'MANAGER', 'CASHIER');
CREATE TYPE stock_movement_type AS ENUM ('IN', 'OUT', 'ADJUSTMENT');
CREATE TYPE payment_method AS ENUM ('Cash', 'Card', 'Digital');
CREATE TYPE supplier_txn_type AS ENUM ('PAYMENT', 'REFUND');

-- ========================
-- BRANCHES
-- ========================
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- USERS (PIN-based auth)
-- ========================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CASHIER',
  pin TEXT NOT NULL DEFAULT '0000',
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- APP SETTINGS (single row)
-- ========================
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT 'Hoard Lavish',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  tax_rate NUMERIC(5,4) NOT NULL DEFAULT 0.08,
  enable_low_stock_alerts BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- CATEGORIES & BRANDS
-- ========================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- ========================
-- PRODUCTS
-- ========================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock_level INT NOT NULL DEFAULT 0,
  sku TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- PRODUCT BRANCH STOCK
-- ========================
CREATE TABLE product_branch_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, branch_id)
);

-- ========================
-- CUSTOMERS
-- ========================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  loyalty_points INT NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- SALES
-- ========================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'Cash',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  branch_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- SALE ITEMS
-- ========================
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- ========================
-- STOCK MOVEMENTS
-- ========================
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL DEFAULT '',
  type stock_movement_type NOT NULL DEFAULT 'IN',
  quantity INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========================
-- SUPPLIERS
-- ========================
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- SUPPLIER TRANSACTIONS
-- ========================
CREATE TABLE supplier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  type supplier_txn_type NOT NULL DEFAULT 'PAYMENT',
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

-- ========================
-- EXPENSES
-- ========================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL DEFAULT ''
);


-- ============================================================
-- VIEW: Products with aggregated stock
-- ============================================================
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


-- ============================================================
-- RPC: Complete a sale (atomically insert sale + items + stock movements + update stock)
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
  p_items JSONB -- array of {product_id, product_name, quantity, price, cost_price}
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
BEGIN
  -- Insert the sale
  INSERT INTO sales (
    invoice_number, date, subtotal, discount, tax, total_amount, total_cost,
    payment_method, customer_id, customer_name, branch_id, branch_name
  ) VALUES (
    p_invoice_number, p_date, p_subtotal, p_discount, p_tax, p_total_amount, p_total_cost,
    p_payment_method, p_customer_id, p_customer_name, p_branch_id, p_branch_name
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items, stock movements, and deduct stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insert sale item
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, cost_price)
    VALUES (
      v_sale_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INT,
      (v_item->>'price')::NUMERIC,
      (v_item->>'cost_price')::NUMERIC
    );

    -- Deduct stock from branch
    UPDATE product_branch_stock
    SET quantity = GREATEST(0, quantity - (v_item->>'quantity')::INT)
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id = p_branch_id;

    -- Log stock movement
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

  -- Update customer loyalty if applicable
  IF p_customer_id IS NOT NULL THEN
    UPDATE customers
    SET total_spent = total_spent + p_total_amount,
        loyalty_points = loyalty_points + FLOOR(p_total_amount / 10)::INT
    WHERE id = p_customer_id;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- ROW LEVEL SECURITY (permissive for anon — PIN-auth phase)
-- ============================================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Permissive policies (all access via anon key — tighten later with Supabase Auth)
CREATE POLICY "Allow all" ON branches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON product_branch_stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON supplier_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON expenses FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- SEED DATA (matches existing constants.ts)
-- ============================================================

-- Branches
INSERT INTO branches (id, name, address, phone) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Ethul Kotte', '123 Fashion Ave, New York, NY', '212-555-0199'),
  ('b0000000-0000-0000-0000-000000000002', 'Mount-Lavinia', '456 Soho St, New York, NY', '212-555-0200');

-- Users
INSERT INTO users (id, name, role, pin, branch_id) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'Admin User', 'ADMIN', '1234', NULL),
  ('aa000000-0000-0000-0000-000000000002', 'John Cashier', 'CASHIER', '0000', 'b0000000-0000-0000-0000-000000000001'),
  ('aa000000-0000-0000-0000-000000000003', 'Sarah Manager', 'MANAGER', '1111', 'b0000000-0000-0000-0000-000000000002');

-- Settings (single row)
INSERT INTO app_settings (store_name, currency_symbol, tax_rate, enable_low_stock_alerts) VALUES
  ('Hoard Lavish', '$', 0.08, true);

-- Categories
INSERT INTO categories (name) VALUES
  ('Clothing'), ('Accessories'), ('Footwear'), ('Bags'), ('Jewelry');

-- Brands
INSERT INTO brands (name) VALUES
  ('Hoard Lavish'), ('Gucci'), ('Prada'), ('Hermes'), ('Rolex'), ('Generic');

-- Products
INSERT INTO products (id, name, category, brand, price, cost_price, min_stock_level, sku, description) VALUES
  ('bb000000-0000-0000-0000-000000000001', 'Midnight Velvet Gown', 'Clothing', 'Hoard Lavish', 1250.00, 600.00, 5, 'DRS-001', 'A luxurious velvet gown in deep midnight blue, perfect for evening galas.'),
  ('bb000000-0000-0000-0000-000000000002', 'Italian Leather Loafers', 'Footwear', 'Gucci', 350.00, 150.00, 10, 'SHO-002', 'Handcrafted Italian leather loafers with a classic finish.'),
  ('bb000000-0000-0000-0000-000000000003', 'Silk Scarf - Hermes Style', 'Accessories', 'Hermes', 180.00, 60.00, 15, 'ACC-003', '100% pure silk scarf with intricate floral patterns.'),
  ('bb000000-0000-0000-0000-000000000004', 'Cashmere Trench Coat', 'Clothing', 'Hoard Lavish', 890.00, 400.00, 5, 'COT-004', 'Beige cashmere blend trench coat, suitable for all seasons.'),
  ('bb000000-0000-0000-0000-000000000005', 'Gold Plated Cufflinks', 'Accessories', 'Generic', 120.00, 40.00, 8, 'ACC-005', 'Minimalist gold plated cufflinks for formal attire.'),
  ('bb000000-0000-0000-0000-000000000006', 'Structured Tote Bag', 'Bags', 'Prada', 450.00, 180.00, 5, 'BAG-006', 'Durable structured tote with ample space for daily essentials.');

-- Product Branch Stock
INSERT INTO product_branch_stock (product_id, branch_id, quantity) VALUES
  ('bb000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 8),
  ('bb000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 4),
  ('bb000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 15),
  ('bb000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 10),
  ('bb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 30),
  ('bb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 20),
  ('bb000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 2),
  ('bb000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 1),
  ('bb000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 20),
  ('bb000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 10),
  ('bb000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 10),
  ('bb000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 5);

-- Customers
INSERT INTO customers (id, name, phone, email, loyalty_points, total_spent) VALUES
  ('cc000000-0000-0000-0000-000000000001', 'Alice Vandetta', '555-0101', 'alice@example.com', 120, 4500),
  ('cc000000-0000-0000-0000-000000000002', 'Julian Thorne', '555-0102', 'j.thorne@example.com', 45, 890),
  ('cc000000-0000-0000-0000-000000000003', 'Miranda Priestly', '555-0103', 'editor@runway.com', 9000, 150000);

-- Suppliers
INSERT INTO suppliers (id, name, contact_person, phone, email, address) VALUES
  ('dd000000-0000-0000-0000-000000000001', 'Global Fabrics Ltd', 'Sarah Jenkins', '212-555-0900', 'orders@globalfabrics.com', '89 Textile District, New York, NY'),
  ('dd000000-0000-0000-0000-000000000002', 'Italian Leather Co.', 'Marco Rossi', '212-555-0922', 'marco@italianleather.com', 'Via Roma 12, Milan, Italy'),
  ('dd000000-0000-0000-0000-000000000003', 'Elite Accessories', 'David Chen', '212-555-0945', 'd.chen@eliteacc.com', '456 Fashion Way, Los Angeles, CA');

-- Expenses
INSERT INTO expenses (description, amount, category, branch_id, branch_name) VALUES
  ('Monthly Store Rent', 4500, 'Rent', 'b0000000-0000-0000-0000-000000000001', 'Ethul Kotte'),
  ('Electricity Bill', 320, 'Utilities', 'b0000000-0000-0000-0000-000000000001', 'Ethul Kotte'),
  ('Instagram Ad Campaign', 500, 'Marketing', 'b0000000-0000-0000-0000-000000000002', 'Mount-Lavinia');

