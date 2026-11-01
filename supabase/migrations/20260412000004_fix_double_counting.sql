-- 1. Add balance to partners and payment_method to purchases/supplier_payments
ALTER TABLE partners ADD COLUMN IF NOT EXISTS balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- 2. Update process_purchase function to use payment_method
CREATE OR REPLACE FUNCTION process_purchase()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Get supplier name
  SELECT name INTO supplier_name FROM suppliers WHERE id = NEW.supplier_id;

  -- A. Update Supplier Balance (we owe them total - paid)
  UPDATE suppliers 
  SET balance = COALESCE(balance, 0) + (NEW.total_amount - NEW.paid_amount)
  WHERE id = NEW.supplier_id;

  -- B. Record Expense in Transactions (only the paid amount)
  IF NEW.paid_amount > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id, date)
    VALUES ('expense', NEW.paid_amount, 'purchase', NEW.id, 'دفعة مشتريات للمورد (' || COALESCE(supplier_name, 'غير معروف') || ') فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), 'supplier', NEW.supplier_id, NEW.created_at::DATE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Update process_supplier_payment function to use payment_method
CREATE OR REPLACE FUNCTION process_supplier_payment()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Get supplier name
  SELECT name INTO supplier_name FROM suppliers WHERE id = NEW.supplier_id;

  -- Update Supplier Balance
  UPDATE suppliers 
  SET balance = COALESCE(balance, 0) - NEW.amount
  WHERE id = NEW.supplier_id;

  -- Record Expense in Transactions
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id, date)
  VALUES ('expense', NEW.amount, 'supplier_payment', NEW.id, 'تسديد دفعة للمورد (' || COALESCE(supplier_name, 'غير معروف') || ')', NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), 'supplier', NEW.supplier_id, CURRENT_DATE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Clean up duplicate transactions
-- This deletes transactions that have the same reference_id and reference_type, keeping only the oldest one
DELETE FROM transactions a
USING transactions b
WHERE a.id > b.id
  AND a.reference_id = b.reference_id
  AND a.reference_type = b.reference_type
  AND a.reference_id IS NOT NULL;

-- 5. Ensure triggers are clean (drop any potential duplicates)
DROP TRIGGER IF EXISTS after_expense_insert_v2 ON expenses;
DROP TRIGGER IF EXISTS after_sale_insert_v2 ON sales;
DROP TRIGGER IF EXISTS after_purchase_insert_v2 ON purchases;
DROP TRIGGER IF EXISTS after_supplier_payment_insert_v2 ON supplier_payments;

-- 6. Update process_sale to handle payment_method correctly
CREATE OR REPLACE FUNCTION process_sale() RETURNS TRIGGER AS $$
BEGIN
  -- Update customer balance if not fully paid
  IF NEW.customer_id IS NOT NULL AND NEW.total_amount > NEW.paid_amount THEN
    UPDATE customers SET balance = COALESCE(balance, 0) + (NEW.total_amount - NEW.paid_amount) WHERE id = NEW.customer_id;
  END IF;

  -- Record the paid amount as income transaction
  IF NEW.paid_amount > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_at, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('income', NEW.paid_amount, 'sale', NEW.id, 'دفعة مبيعات فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_at::DATE, NEW.created_at, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
