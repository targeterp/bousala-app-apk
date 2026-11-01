-- RPC to create internal production
CREATE OR REPLACE FUNCTION create_internal_production(
    p_product_id UUID,
    p_target_product_id UUID,
    p_fabric_meters_per_unit DECIMAL,
    p_quantity DECIMAL,
    p_tailor_id UUID,
    p_tailoring_cost DECIMAL,
    p_date DATE,
    p_notes TEXT,
    p_tenant_id UUID
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total_fabric DECIMAL;
BEGIN
    v_total_fabric := p_fabric_meters_per_unit * p_quantity;

    -- 1. Create Order
    INSERT INTO custom_orders (
        tenant_id, customer_id, total_price, advance_payment, paid_amount, 
        status, order_date, expected_delivery_date
    ) VALUES (
        p_tenant_id, NULL, 0, 0, 0, 
        'delivered', p_date, p_date
    ) RETURNING id INTO v_order_id;

    -- 2. Create Order Item (FIXED: Added tailor_id)
    INSERT INTO custom_order_items (
        custom_order_id, tenant_id, product_id, target_product_id, 
        tailor_id, fabric_meters, tailoring_cost, notes
    ) VALUES (
        v_order_id, p_tenant_id, p_product_id, p_target_product_id, 
        p_tailor_id, v_total_fabric, p_tailoring_cost, 
        jsonb_build_object('type', 'internal', 'meters_per_unit', p_fabric_meters_per_unit, 'quantity', p_quantity, 'notes', p_notes)::text
    );

    -- 3. Update Raw Material Stock
    UPDATE products 
    SET stock_quantity = stock_quantity - v_total_fabric 
    WHERE id = p_product_id;

    -- 4. Update Finished Product Stock
    IF p_target_product_id IS NOT NULL THEN
        UPDATE products 
        SET stock_quantity = stock_quantity + p_quantity 
        WHERE id = p_target_product_id;
    END IF;

    -- 5. Update Tailor Balance
    IF p_tailor_id IS NOT NULL THEN
        UPDATE tailors 
        SET balance = balance + p_tailoring_cost 
        WHERE id = p_tailor_id;
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- RPC to update internal production (Delta Logic)
CREATE OR REPLACE FUNCTION update_internal_production(
    p_order_id UUID,
    p_new_product_id UUID,
    p_new_target_product_id UUID,
    p_new_fabric_meters_per_unit DECIMAL,
    p_new_quantity DECIMAL,
    p_new_tailor_id UUID,
    p_new_tailoring_cost DECIMAL,
    p_new_notes TEXT
) RETURNS void AS $$
DECLARE
    v_old_item RECORD;
    v_old_meta JSONB;
    v_old_quantity DECIMAL;
    v_old_total_fabric DECIMAL;
    v_new_total_fabric DECIMAL;
BEGIN
    -- Get old data
    SELECT * INTO v_old_item FROM custom_order_items WHERE custom_order_id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    -- Parse metadata from notes
    BEGIN
        v_old_meta := v_old_item.notes::jsonb;
        v_old_quantity := (v_old_meta->>'quantity')::decimal;
    EXCEPTION WHEN OTHERS THEN
        v_old_quantity := 1;
    END;
    
    v_old_total_fabric := v_old_item.fabric_meters;
    v_new_total_fabric := p_new_fabric_meters_per_unit * p_new_quantity;

    -- 1. Adjust Raw Material (Delta)
    IF v_old_item.product_id = p_new_product_id THEN
        UPDATE products SET stock_quantity = stock_quantity + (v_old_total_fabric - v_new_total_fabric) WHERE id = p_new_product_id;
    ELSE
        UPDATE products SET stock_quantity = stock_quantity + v_old_total_fabric WHERE id = v_old_item.product_id;
        UPDATE products SET stock_quantity = stock_quantity - v_new_total_fabric WHERE id = p_new_product_id;
    END IF;

    -- 2. Adjust Finished Product (Delta)
    IF v_old_item.target_product_id = p_new_target_product_id THEN
        IF p_new_target_product_id IS NOT NULL THEN
            UPDATE products SET stock_quantity = stock_quantity + (p_new_quantity - v_old_quantity) WHERE id = p_new_target_product_id;
        END IF;
    ELSE
        IF v_old_item.target_product_id IS NOT NULL THEN
            UPDATE products SET stock_quantity = stock_quantity - v_old_quantity WHERE id = v_old_item.target_product_id;
        END IF;
        IF p_new_target_product_id IS NOT NULL THEN
            UPDATE products SET stock_quantity = stock_quantity + p_new_quantity WHERE id = p_new_target_product_id;
        END IF;
    END IF;

    -- 3. Adjust Tailor (Delta)
    IF v_old_item.tailor_id = p_new_tailor_id THEN
        IF p_new_tailor_id IS NOT NULL THEN
            UPDATE tailors SET balance = balance + (p_new_tailoring_cost - v_old_item.tailoring_cost) WHERE id = p_new_tailor_id;
        END IF;
    ELSE
        IF v_old_item.tailor_id IS NOT NULL THEN
            UPDATE tailors SET balance = balance - v_old_item.tailoring_cost WHERE id = v_old_item.tailor_id;
        END IF;
        IF p_new_tailor_id IS NOT NULL THEN
            UPDATE tailors SET balance = balance + p_new_tailoring_cost WHERE id = p_new_tailor_id;
        END IF;
    END IF;

    -- 4. Update Records
    UPDATE custom_order_items SET
        product_id = p_new_product_id,
        target_product_id = p_new_target_product_id,
        tailor_id = p_new_tailor_id,
        fabric_meters = v_new_total_fabric,
        tailoring_cost = p_new_tailoring_cost,
        notes = jsonb_build_object('type', 'internal', 'meters_per_unit', p_new_fabric_meters_per_unit, 'quantity', p_new_quantity, 'notes', p_new_notes)::text
    WHERE id = v_old_item.id;

END;
$$ LANGUAGE plpgsql;

-- RPC to delete internal production
CREATE OR REPLACE FUNCTION delete_internal_production(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item RECORD;
    v_meta JSONB;
    v_quantity DECIMAL;
BEGIN
    SELECT * INTO v_item FROM custom_order_items WHERE custom_order_id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    BEGIN
        v_meta := v_item.notes::jsonb;
        v_quantity := (v_meta->>'quantity')::decimal;
    EXCEPTION WHEN OTHERS THEN
        v_quantity := 1;
    END;

    -- 1. Return Raw Material
    UPDATE products SET stock_quantity = stock_quantity + v_item.fabric_meters WHERE id = v_item.product_id;

    -- 2. Deduct Finished Product
    IF v_item.target_product_id IS NOT NULL THEN
        UPDATE products SET stock_quantity = stock_quantity - v_quantity WHERE id = v_item.target_product_id;
    END IF;

    -- 3. Deduct Tailor Balance
    IF v_item.tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = balance - v_item.tailoring_cost WHERE id = v_item.tailor_id;
    END IF;

    -- 4. Delete Records
    DELETE FROM custom_order_items WHERE custom_order_id = p_order_id;
    DELETE FROM custom_orders WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
