-- 1. Make trigger functions idempotent to prevent double-counting from duplicate triggers

-- Process Sale
CREATE OR REPLACE FUNCTION process_sale() RETURNS TRIGGER AS $$
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'sale') THEN
    RETURN NEW;
  END IF;

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

-- Process Expense
CREATE OR REPLACE FUNCTION process_expense() RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
  emp_name TEXT;
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'expense') THEN
    RETURN NEW;
  END IF;

  -- Get category name
  SELECT name INTO cat_name FROM expense_categories WHERE id = NEW.category_id;
  IF cat_name IS NULL THEN cat_name := 'مصروف عام'; END IF;

  -- Get employee name if applicable
  IF NEW.employee_id IS NOT NULL THEN
    SELECT full_name INTO emp_name FROM employees WHERE id = NEW.employee_id;
    IF emp_name IS NOT NULL THEN
      cat_name := cat_name || ' (' || emp_name || ')';
    END IF;
  END IF;

  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
  VALUES ('expense', NEW.amount, 'expense', NEW.id, cat_name || ': ' || COALESCE(NEW.description, ''), NEW.date, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.employee_id IS NOT NULL THEN 'employee' ELSE 'general' END, NEW.employee_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Process Purchase
CREATE OR REPLACE FUNCTION process_purchase()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'purchase') THEN
    RETURN NEW;
  END IF;

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

-- Process Supplier Payment
CREATE OR REPLACE FUNCTION process_supplier_payment()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'supplier_payment') THEN
    RETURN NEW;
  END IF;

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

-- 2. Clean up any remaining duplicates
DELETE FROM transactions a
USING transactions b
WHERE a.id > b.id
  AND a.reference_id = b.reference_id
  AND a.reference_type = b.reference_type
  AND a.reference_id IS NOT NULL;

-- 3. Drop all known trigger names to ensure only one remains
-- We'll keep 'after_expense_insert', 'after_sale_insert', 'after_purchase_insert', 'after_supplier_payment_insert'
-- and drop any others we might have created.

DROP TRIGGER IF EXISTS after_expense_insert_v2 ON expenses;
DROP TRIGGER IF EXISTS after_expense_insert_v3 ON expenses;
DROP TRIGGER IF EXISTS expense_trigger ON expenses;

DROP TRIGGER IF EXISTS after_sale_insert_v2 ON sales;
DROP TRIGGER IF EXISTS after_sale_insert_v3 ON sales;
DROP TRIGGER IF EXISTS sale_trigger ON sales;

DROP TRIGGER IF EXISTS after_purchase_insert_v2 ON purchases;
DROP TRIGGER IF EXISTS after_purchase_insert_v3 ON purchases;
DROP TRIGGER IF EXISTS purchase_trigger ON purchases;

DROP TRIGGER IF EXISTS after_supplier_payment_insert_v2 ON supplier_payments;
DROP TRIGGER IF EXISTS after_supplier_payment_insert_v3 ON supplier_payments;
DROP TRIGGER IF EXISTS supplier_payment_trigger ON supplier_payments;

NOTIFY pgrst, 'reload schema';
