-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (Employees/Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee', -- 'admin', 'manager', 'employee'
  salary DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  balance DECIMAL(12, 2) DEFAULT 0, -- Positive means they owe us, negative means we owe them
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  balance DECIMAL(12, 2) DEFAULT 0, -- Positive means we owe them
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  purchase_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  sell_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES suppliers(id),
  image_url TEXT,
  images TEXT[],
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sales (Invoices)
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'pending', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- 6. Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL
);

-- 7. Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- 'salary', 'rent', 'utilities', 'marketing', 'other'
  amount DECIMAL(12, 2) NOT NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO expense_categories (name) VALUES 
('رواتب'), ('إيجار'), ('كهرباء'), ('تسويق'), ('نثريات'), ('صيانة')
ON CONFLICT (name) DO NOTHING;

-- Modify expenses table to use category_id instead of category text
ALTER TABLE expenses
  ADD COLUMN category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL;

-- Update existing expenses to link to a default category if possible, or leave null
-- For new schema, we'll just drop the old category column
ALTER TABLE expenses DROP COLUMN IF EXISTS category;

-- 8. Purchases (from suppliers)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
  total_amount DECIMAL(12, 2) NOT NULL,
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(12, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Supplier Payments
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Financial Transactions (The core of the accounting logic)
-- Tracks all money in and out
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL, -- 'income' (sales, customer payment), 'expense' (purchases, salaries, bills)
  amount DECIMAL(12, 2) NOT NULL,
  reference_type TEXT, -- 'sale', 'expense', 'supplier_payment', 'customer_payment', 'purchase'
  reference_id UUID, -- ID of the sale, expense, etc.
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- RLS Policies (Simplified for this example, allowing authenticated users to do most things)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies (assuming all authenticated users can access for now, can be restricted by role later)
CREATE POLICY "Allow all for authenticated" ON profiles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON suppliers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON sales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON sale_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON expense_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON purchases FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON purchase_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON supplier_payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON transactions FOR ALL USING (auth.role() = 'authenticated');

-- Triggers to automate accounting

-- 1. When a sale is created, update customer balance and create a transaction
CREATE OR REPLACE FUNCTION process_sale() RETURNS TRIGGER AS $$
BEGIN
  -- Update customer balance if not fully paid
  IF NEW.customer_id IS NOT NULL AND NEW.total_amount > NEW.paid_amount THEN
    UPDATE customers SET balance = balance + (NEW.total_amount - NEW.paid_amount) WHERE id = NEW.customer_id;
  END IF;

  -- Record the paid amount as income transaction
  IF NEW.paid_amount > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_at, created_by, tenant_id)
    VALUES ('income', NEW.paid_amount, 'sale', NEW.id, 'دفعة مبيعات فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_at::DATE, NEW.created_at, NEW.created_by, NEW.tenant_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_sale_insert ON sales;
CREATE TRIGGER after_sale_insert
AFTER INSERT ON sales
FOR EACH ROW EXECUTE FUNCTION process_sale();

-- 2. When an expense is created, create a transaction
CREATE OR REPLACE FUNCTION process_expense() RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
BEGIN
  -- Get category name
  SELECT name INTO cat_name FROM expense_categories WHERE id = NEW.category_id;
  IF cat_name IS NULL THEN cat_name := 'مصروف عام'; END IF;

  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by)
  VALUES ('expense', NEW.amount, 'expense', NEW.id, cat_name || ': ' || COALESCE(NEW.description, ''), NEW.date, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_expense_insert ON expenses;
CREATE TRIGGER after_expense_insert
AFTER INSERT ON expenses
FOR EACH ROW EXECUTE FUNCTION process_expense();

-- 3. Process Purchase (Update Supplier Balance, Transactions)
CREATE OR REPLACE FUNCTION process_purchase()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Get supplier name
  SELECT name INTO supplier_name FROM suppliers WHERE id = NEW.supplier_id;

  -- A. Update Supplier Balance (we owe them total - paid)
  UPDATE suppliers 
  SET balance = balance + (NEW.total_amount - NEW.paid_amount)
  WHERE id = NEW.supplier_id;

  -- B. Record Expense in Transactions (only the paid amount)
  IF NEW.paid_amount > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by)
    VALUES ('expense', NEW.paid_amount, 'purchase', NEW.id, 'دفعة مشتريات للمورد (' || COALESCE(supplier_name, 'غير معروف') || ') فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_purchase_insert ON purchases;
CREATE TRIGGER after_purchase_insert
  AFTER INSERT ON purchases
  FOR EACH ROW EXECUTE PROCEDURE process_purchase();

-- 4. Process Purchase Items (Update Product Stock and Purchase Price)
CREATE OR REPLACE FUNCTION process_purchase_item()
RETURNS trigger AS $$
BEGIN
  UPDATE products 
  SET stock_quantity = stock_quantity + NEW.quantity,
      purchase_price = NEW.unit_price -- Update to latest purchase price
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_purchase_item_insert ON purchase_items;
CREATE TRIGGER after_purchase_item_insert
  AFTER INSERT ON purchase_items
  FOR EACH ROW EXECUTE PROCEDURE process_purchase_item();

-- 5. Process Supplier Payment (Update Supplier Balance, Transactions)
CREATE OR REPLACE FUNCTION process_supplier_payment()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Get supplier name
  SELECT name INTO supplier_name FROM suppliers WHERE id = NEW.supplier_id;

  -- A. Decrease what we owe the supplier
  UPDATE suppliers 
  SET balance = balance - NEW.amount
  WHERE id = NEW.supplier_id;

  -- B. Record Expense in Transactions
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by)
  VALUES ('expense', NEW.amount, 'supplier_payment', NEW.id, 'تسديد دفعة للمورد (' || COALESCE(supplier_name, 'غير معروف') || ')', NEW.created_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_supplier_payment_insert ON supplier_payments;
CREATE TRIGGER after_supplier_payment_insert
  AFTER INSERT ON supplier_payments
  FOR EACH ROW EXECUTE PROCEDURE process_supplier_payment();

-- 12. Tailors
CREATE TABLE IF NOT EXISTS tailors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  balance DECIMAL(12, 2) DEFAULT 0, -- Positive means we owe them
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Custom Orders (الكوماند)
CREATE TABLE IF NOT EXISTS custom_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  total_price DECIMAL(12, 2) NOT NULL,
  advance_payment DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'tailoring', 'ready', 'delivered'
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Custom Order Items
CREATE TABLE IF NOT EXISTS custom_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  custom_order_id UUID REFERENCES custom_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT, -- The fabric
  fabric_meters DECIMAL(10, 2) NOT NULL,
  tailor_id UUID REFERENCES tailors(id) ON DELETE RESTRICT,
  tailoring_cost DECIMAL(12, 2) NOT NULL,
  notes TEXT, -- Measurements, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Tailor Payments
CREATE TABLE IF NOT EXISTS tailor_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tailor_id UUID REFERENCES tailors(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for new tables
ALTER TABLE tailors ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON tailors FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON custom_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON custom_order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all for authenticated" ON tailor_payments FOR ALL USING (auth.role() = 'authenticated');

-- Triggers for Custom Orders

-- A. Deduct fabric inventory and update tailor balance
CREATE OR REPLACE FUNCTION process_custom_order_item() RETURNS TRIGGER AS $$
BEGIN
  -- Deduct fabric from stock
  UPDATE products
  SET stock_quantity = stock_quantity - NEW.fabric_meters
  WHERE id = NEW.product_id;
  
  -- Add tailoring cost to tailor's balance (we owe them)
  UPDATE tailors
  SET balance = balance + NEW.tailoring_cost
  WHERE id = NEW.tailor_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_custom_order_item_insert ON custom_order_items;
CREATE TRIGGER after_custom_order_item_insert
AFTER INSERT ON custom_order_items
FOR EACH ROW EXECUTE FUNCTION process_custom_order_item();

-- B. Advance payment transaction
CREATE OR REPLACE FUNCTION process_custom_order_advance() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.advance_payment > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by)
    VALUES ('income', NEW.advance_payment, 'custom_order_advance', NEW.id, 'دفعة أولية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), NEW.order_date, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_custom_order_insert ON custom_orders;
CREATE TRIGGER after_custom_order_insert
AFTER INSERT ON custom_orders
FOR EACH ROW EXECUTE FUNCTION process_custom_order_advance();

-- C. Remaining payment on delivery
CREATE OR REPLACE FUNCTION process_custom_order_delivery() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    IF (NEW.total_price - NEW.advance_payment) > 0 THEN
      INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by)
      VALUES ('income', NEW.total_price - NEW.advance_payment, 'custom_order_remaining', NEW.id, 'دفعة متبقية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), CURRENT_DATE, NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_custom_order_update ON custom_orders;
CREATE TRIGGER after_custom_order_update
AFTER UPDATE ON custom_orders
FOR EACH ROW EXECUTE FUNCTION process_custom_order_delivery();

-- D. Tailor payment -> Expense Transaction & Balance Update
CREATE OR REPLACE FUNCTION process_tailor_payment() RETURNS TRIGGER AS $$
DECLARE
  tailor_name TEXT;
BEGIN
  -- Decrease what we owe the tailor
  UPDATE tailors
  SET balance = balance - NEW.amount
  WHERE id = NEW.tailor_id;

  -- Get tailor name
  SELECT name INTO tailor_name FROM tailors WHERE id = NEW.tailor_id;
  
  -- Insert into transactions
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by)
  VALUES ('expense', NEW.amount, 'tailor_payment', NEW.id, 'دفعة للخياط: ' || tailor_name || COALESCE(' - ' || NEW.reference_note, ''), NEW.payment_date, NEW.created_by);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_tailor_payment_insert ON tailor_payments;
CREATE TRIGGER after_tailor_payment_insert
AFTER INSERT ON tailor_payments
FOR EACH ROW EXECUTE FUNCTION process_tailor_payment();

-- ==============================================================================
-- SCHEMA UPDATES (Safe to run multiple times)
-- ==============================================================================

-- Add missing columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference_id UUID;

-- Add missing columns to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[];

-- Add missing columns to custom_order_items
ALTER TABLE custom_order_items ADD COLUMN IF NOT EXISTS target_product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add missing notes column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;

