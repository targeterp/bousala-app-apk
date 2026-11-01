-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  salary DECIMAL(12, 2) DEFAULT 0,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON employees FOR ALL USING (auth.role() = 'authenticated');

-- Add employee_id to expenses if it doesn't exist, referencing employees
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Ensure expense categories exist
INSERT INTO expense_categories (name) VALUES 
('الأجور'), ('رواتب'), ('إيجار'), ('كهرباء'), ('تسويق'), ('نثريات'), ('صيانة')
ON CONFLICT (name) DO NOTHING;

-- Update process_expense trigger to include employee name in description
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

  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by)
  VALUES ('expense', NEW.amount, 'expense', NEW.id, cat_name || ': ' || COALESCE(NEW.description, ''), NEW.date, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
