-- Update process_purchase trigger to include supplier name
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

-- Update process_supplier_payment trigger to include supplier name
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
