-- Add unit column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'قطعة';

-- Alter stock_quantity in products to support decimals
ALTER TABLE products ALTER COLUMN stock_quantity TYPE NUMERIC;

-- Alter quantity in sale_items to support decimals
ALTER TABLE sale_items ALTER COLUMN quantity TYPE NUMERIC;

-- Alter quantity in purchase_items to support decimals
ALTER TABLE purchase_items ALTER COLUMN quantity TYPE NUMERIC;
