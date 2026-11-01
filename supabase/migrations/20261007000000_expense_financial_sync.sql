-- Migration: Expense and Financial Transactions Sync
-- Description: Automatically removes and updates financial transactions when an expense is deleted or modified.

-- 1. Trigger for DELETE on expenses
CREATE OR REPLACE FUNCTION process_expense_delete() RETURNS TRIGGER AS $$
BEGIN
  -- Delete matching transaction from financial records
  DELETE FROM transactions
  WHERE reference_id = OLD.id
    AND reference_type = 'expense';
    
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_expense_delete ON expenses;
CREATE TRIGGER after_expense_delete
AFTER DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION process_expense_delete();

-- 2. Trigger for UPDATE on expenses
CREATE OR REPLACE FUNCTION process_expense_update() RETURNS TRIGGER AS $$
DECLARE
  cat_name TEXT;
  emp_name TEXT;
  desc_text TEXT;
BEGIN
  -- Get category name
  SELECT name INTO cat_name FROM expense_categories WHERE id = NEW.category_id;
  IF cat_name IS NULL THEN cat_name := 'مصروف عام'; END IF;

  -- Get employee name if applicable
  IF NEW.employee_id IS NOT NULL THEN
    SELECT full_name INTO emp_name FROM employees WHERE id = NEW.employee_id;
    IF emp_name IS NOT NULL THEN
      desc_text := cat_name || ' (' || emp_name || '): ' || COALESCE(NEW.description, '');
    ELSE
      desc_text := cat_name || ': ' || COALESCE(NEW.description, '');
    END IF;
  ELSE
    desc_text := cat_name || ': ' || COALESCE(NEW.description, '');
  END IF;

  -- Update corresponding transaction record in financial ledger
  UPDATE transactions
  SET amount = NEW.amount,
      date = NEW.date,
      payment_method = COALESCE(NEW.payment_method, 'cash'),
      description = desc_text,
      entity_type = CASE WHEN NEW.employee_id IS NOT NULL THEN 'employee' ELSE 'general' END,
      entity_id = NEW.employee_id
  WHERE reference_id = NEW.id
    AND reference_type = 'expense';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_expense_update ON expenses;
CREATE TRIGGER after_expense_update
AFTER UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION process_expense_update();
