-- Add payment_method to expenses table
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- Update process_expense function to use the payment_method from the expense record
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
  VALUES ('expense', NEW.amount, 'expense', NEW.id, cat_name || ': ' || COALESCE(NEW.description, ''), NEW.date, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.employee_id IS NOT NULL THEN 'employee' ELSE 'general' END, NEW.employee_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
