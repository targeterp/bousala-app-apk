-- Add missing fields to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS barcode TEXT,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Notify pgrst to reload schema cache
NOTIFY pgrst, 'reload schema';
