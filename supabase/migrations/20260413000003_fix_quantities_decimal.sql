-- Change quantity and stock columns to DECIMAL to support fabric measurements
ALTER TABLE products ALTER COLUMN stock_quantity TYPE DECIMAL(12, 2);
ALTER TABLE purchase_items ALTER COLUMN quantity TYPE DECIMAL(12, 2);
ALTER TABLE sale_items ALTER COLUMN quantity TYPE DECIMAL(12, 2);

-- Update triggers to handle decimal quantities (PostgreSQL handles this automatically with DECIMAL type, but good to be sure)
-- No changes needed to trigger logic itself as it just uses + and -
