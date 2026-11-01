CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID DEFAULT auth.uid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'in', 'out', 'split_out', 'split_in', 'adjustment'
  quantity DECIMAL NOT NULL,
  previous_stock DECIMAL NOT NULL,
  new_stock DECIMAL NOT NULL,
  reference_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'Users can view their tenant''s inventory_movements'
    ) THEN
        CREATE POLICY "Users can view their tenant's inventory_movements"
            ON inventory_movements FOR SELECT
            USING (tenant_id = (SELECT get_current_tenant_id()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'Users can insert their tenant''s inventory_movements'
    ) THEN
        CREATE POLICY "Users can insert their tenant's inventory_movements"
            ON inventory_movements FOR INSERT
            WITH CHECK (tenant_id = (SELECT get_current_tenant_id()));
    END IF;
END $$;

-- RPC for splitting products
CREATE OR REPLACE FUNCTION split_product(
    p_source_product_id UUID,
    p_target_product_id UUID,
    p_source_qty DECIMAL,
    p_target_qty DECIMAL,
    p_tenant_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
DECLARE
    v_source_stock DECIMAL;
    v_target_stock DECIMAL;
BEGIN
    -- Get current stocks
    SELECT stock_quantity INTO v_source_stock FROM products WHERE id = p_source_product_id AND tenant_id = p_tenant_id FOR UPDATE;
    SELECT stock_quantity INTO v_target_stock FROM products WHERE id = p_target_product_id AND tenant_id = p_tenant_id FOR UPDATE;

    IF v_source_stock < p_source_qty THEN
        RAISE EXCEPTION 'Not enough stock in source product.';
    END IF;

    -- Update stocks
    UPDATE products SET stock_quantity = stock_quantity - p_source_qty WHERE id = p_source_product_id;
    UPDATE products SET stock_quantity = stock_quantity + p_target_qty WHERE id = p_target_product_id;

    -- Insert movements
    INSERT INTO inventory_movements (tenant_id, product_id, type, quantity, previous_stock, new_stock, reference_note, created_by)
    VALUES (p_tenant_id, p_source_product_id, 'split_out', p_source_qty, v_source_stock, v_source_stock - p_source_qty, 'فك وتجزئة إلى منتج آخر', p_user_id);

    INSERT INTO inventory_movements (tenant_id, product_id, type, quantity, previous_stock, new_stock, reference_note, created_by)
    VALUES (p_tenant_id, p_target_product_id, 'split_in', p_target_qty, v_target_stock, v_target_stock + p_target_qty, 'نتيجة فك وتجزئة', p_user_id);
END;
$$ LANGUAGE plpgsql;

-- RPC for manual adjustment
CREATE OR REPLACE FUNCTION adjust_stock(
    p_product_id UUID,
    p_quantity_change DECIMAL,
    p_note TEXT,
    p_tenant_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
DECLARE
    v_current_stock DECIMAL;
BEGIN
    SELECT stock_quantity INTO v_current_stock FROM products WHERE id = p_product_id AND tenant_id = p_tenant_id FOR UPDATE;

    UPDATE products SET stock_quantity = stock_quantity + p_quantity_change WHERE id = p_product_id;

    INSERT INTO inventory_movements (tenant_id, product_id, type, quantity, previous_stock, new_stock, reference_note, created_by)
    VALUES (p_tenant_id, p_product_id, 'adjustment', p_quantity_change, v_current_stock, v_current_stock + p_quantity_change, p_note, p_user_id);
END;
$$ LANGUAGE plpgsql;
