-- Fix expenses table: make category column nullable to prevent not-null constraint errors
-- This happens if the database was created before the category column was dropped in the schema

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'category') THEN
    ALTER TABLE expenses ALTER COLUMN category DROP NOT NULL;
  END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
