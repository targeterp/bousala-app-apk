-- Update triggers to include payment_method, entity_type, and entity_id

-- 1. Process Sale
CREATE OR REPLACE FUNCTION process_sale() RETURNS TRIGGER AS $$
BEGIN
  -- Update customer balance if not fully paid
  IF NEW.customer_id IS NOT NULL AND NEW.total_amount > NEW.paid_amount THEN
    UPDATE customers SET balance = balance + (NEW.total_amount - NEW.paid_amount) WHERE id = NEW.customer_id;
  END IF;

  -- Record the paid amount as income transaction
  IF NEW.paid_amount > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_at, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('income', NEW.paid_amount, 'sale', NEW.id, 'دفعة مبيعات فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_at::DATE, NEW.created_at, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Process Purchase
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
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('expense', NEW.paid_amount, 'purchase', NEW.id, 'دفعة مشتريات للمورد (' || COALESCE(supplier_name, 'غير معروف') || ') فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_by, NEW.tenant_id, 'cash', 'supplier', NEW.supplier_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Process Supplier Payment
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
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id)
  VALUES ('expense', NEW.amount, 'supplier_payment', NEW.id, 'تسديد دفعة للمورد (' || COALESCE(supplier_name, 'غير معروف') || ')', NEW.created_by, NEW.tenant_id, 'cash', 'supplier', NEW.supplier_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Process Custom Order Advance
CREATE OR REPLACE FUNCTION process_custom_order_advance() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.advance_payment > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('income', NEW.advance_payment, 'custom_order_advance', NEW.id, 'دفعة أولية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), NEW.order_date, NEW.created_by, NEW.tenant_id, 'cash', CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Process Custom Order Delivery (Completion)
CREATE OR REPLACE FUNCTION process_custom_order_delivery() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    IF (NEW.total_price - NEW.advance_payment) > 0 THEN
      INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
      VALUES ('income', NEW.total_price - NEW.advance_payment, 'custom_order_remaining', NEW.id, 'دفعة متبقية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), CURRENT_DATE, NEW.created_by, NEW.tenant_id, 'cash', CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Process Tailor Payment
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
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
  VALUES ('expense', NEW.amount, 'tailor_payment', NEW.id, 'دفعة للخياط: ' || tailor_name || COALESCE(' - ' || NEW.reference_note, ''), NEW.payment_date, NEW.created_by, NEW.tenant_id, 'cash', 'general', NULL);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Process Expense
CREATE OR REPLACE FUNCTION process_expense() RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
  emp_name TEXT;
BEGIN
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
  VALUES ('expense', NEW.amount, 'expense', NEW.id, cat_name || ': ' || COALESCE(NEW.description, ''), NEW.date, NEW.created_by, NEW.tenant_id, 'cash', CASE WHEN NEW.employee_id IS NOT NULL THEN 'employee' ELSE 'general' END, NEW.employee_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
