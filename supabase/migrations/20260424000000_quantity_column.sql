-- Migration to add quantity column and update RPCs
-- 1. Add quantity column to custom_order_items
ALTER TABLE custom_order_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- 2. Update create_custom_order (v3)
CREATE OR REPLACE FUNCTION create_custom_order_v3(
    p_customer_id UUID,
    p_product_id UUID,
    p_target_product_id UUID,
    p_fabric_meters DECIMAL,
    p_tailor_id UUID,
    p_tailoring_cost DECIMAL,
    p_total_price DECIMAL,
    p_advance_payment DECIMAL,
    p_expected_delivery_date DATE,
    p_notes TEXT,
    p_tenant_id UUID,
    p_quantity INTEGER DEFAULT 1,
    p_advance_payment_method TEXT DEFAULT 'cash'
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_debt DECIMAL;
BEGIN
    -- 1. Order
    INSERT INTO custom_orders (tenant_id, customer_id, total_price, advance_payment, status, order_date, expected_delivery_date)
    VALUES (p_tenant_id, p_customer_id, p_total_price, p_advance_payment, 'pending', CURRENT_DATE, p_expected_delivery_date) 
    RETURNING id INTO v_order_id;

    -- 2. Order Item
    INSERT INTO custom_order_items (custom_order_id, tenant_id, product_id, target_product_id, tailor_id, fabric_meters, tailoring_cost, notes, quantity)
    VALUES (v_order_id, p_tenant_id, p_product_id, p_target_product_id, p_tailor_id, p_fabric_meters, p_tailoring_cost, p_notes, p_quantity);

    -- 3. Stock: Deduct Raw Material
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - p_fabric_meters WHERE id = p_product_id;

    -- 4. Tailor: Add Balance
    IF p_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + p_tailoring_cost WHERE id = p_tailor_id;
    END IF;

    -- 5. Customer: Add Debt
    v_debt := COALESCE(p_total_price, 0) - COALESCE(p_advance_payment, 0);
    IF p_customer_id IS NOT NULL AND v_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_debt WHERE id = p_customer_id;
        
        -- Add transaction for debt
        INSERT INTO transactions (tenant_id, type, amount, reference_type, reference_id, description, date, payment_method, entity_type, entity_id)
        VALUES (p_tenant_id, 'expense', v_debt, 'custom_order_debt', v_order_id, 'تراكم دين متبقي لطلب تفصيل رقم ' || substr(v_order_id::text, 1, 8), CURRENT_DATE, 'debt_record', 'customer', p_customer_id);
    END IF;

    -- 6. Transaction for Advance Payment
    IF p_advance_payment > 0 THEN
        INSERT INTO transactions (tenant_id, type, amount, reference_type, reference_id, description, date, payment_method, entity_type, entity_id)
        VALUES (p_tenant_id, 'income', p_advance_payment, 'custom_order_advance', v_order_id, 'دفعة مقدمة لطلب تفصيل رقم ' || substr(v_order_id::text, 1, 8), CURRENT_DATE, COALESCE(p_advance_payment_method, 'cash'), 'customer', p_customer_id);
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Update custom order (v3)
CREATE OR REPLACE FUNCTION update_custom_order_v3(
    p_order_id UUID,
    p_new_customer_id UUID,
    p_new_product_id UUID,
    p_new_target_product_id UUID,
    p_new_fabric_meters DECIMAL,
    p_new_tailor_id UUID,
    p_new_tailoring_cost DECIMAL,
    p_new_total_price DECIMAL,
    p_new_advance_payment DECIMAL,
    p_new_expected_delivery_date DATE,
    p_new_notes TEXT,
    p_new_quantity INTEGER DEFAULT 1,
    p_new_advance_payment_method TEXT DEFAULT 'cash'
) RETURNS void AS $$
DECLARE
    v_old_order RECORD;
    v_old_item RECORD;
    v_old_debt DECIMAL;
    v_new_debt DECIMAL;
BEGIN
    SELECT * INTO v_old_order FROM custom_orders WHERE id = p_order_id;
    SELECT * INTO v_old_item FROM custom_order_items WHERE custom_order_id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- 1. Revert Old Raw Material & Apply New
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + COALESCE(v_old_item.fabric_meters, 0) WHERE id = v_old_item.product_id;
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - COALESCE(p_new_fabric_meters, 0) WHERE id = p_new_product_id;

    -- 2. Revert Old Tailor Balance & Apply New
    IF v_old_item.tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) - COALESCE(v_old_item.tailoring_cost, 0) WHERE id = v_old_item.tailor_id;
    END IF;
    IF p_new_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + COALESCE(p_new_tailoring_cost, 0) WHERE id = p_new_tailor_id;
    END IF;

    -- 3. Revert Old Customer Debt & Apply New
    v_old_debt := COALESCE(v_old_order.total_price, 0) - COALESCE(v_old_order.advance_payment, 0);
    IF v_old_order.customer_id IS NOT NULL AND v_old_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) - v_old_debt WHERE id = v_old_order.customer_id;
        DELETE FROM transactions WHERE reference_id = p_order_id AND reference_type = 'custom_order_debt';
    END IF;

    v_new_debt := COALESCE(p_new_total_price, 0) - COALESCE(p_new_advance_payment, 0);
    IF p_new_customer_id IS NOT NULL AND v_new_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_new_debt WHERE id = p_new_customer_id;
        INSERT INTO transactions (tenant_id, type, amount, reference_type, reference_id, description, date, payment_method, entity_type, entity_id)
        VALUES (v_old_order.tenant_id, 'expense', v_new_debt, 'custom_order_debt', p_order_id, 'تراكم دين متبقي لطلب تفصيل رقم ' || substr(p_order_id::text, 1, 8), CURRENT_DATE, 'debt_record', 'customer', p_new_customer_id);
    END IF;

    -- Update Advance Payment Transaction
    DELETE FROM transactions WHERE reference_id = p_order_id AND reference_type = 'custom_order_advance';
    IF p_new_advance_payment > 0 THEN
        INSERT INTO transactions (tenant_id, type, amount, reference_type, reference_id, description, date, payment_method, entity_type, entity_id)
        VALUES (v_old_order.tenant_id, 'income', p_new_advance_payment, 'custom_order_advance', p_order_id, 'دفعة مقدمة لطلب تفصيل رقم ' || substr(p_order_id::text, 1, 8), CURRENT_DATE, COALESCE(p_new_advance_payment_method, 'cash'), 'customer', p_new_customer_id);
    END IF;

    -- 4. Update Records
    UPDATE custom_orders SET
        customer_id = p_new_customer_id,
        total_price = p_new_total_price,
        advance_payment = p_new_advance_payment,
        expected_delivery_date = p_new_expected_delivery_date
    WHERE id = p_order_id;

    UPDATE custom_order_items SET
        product_id = p_new_product_id,
        target_product_id = p_new_target_product_id,
        tailor_id = p_new_tailor_id,
        fabric_meters = p_new_fabric_meters,
        tailoring_cost = p_new_tailoring_cost,
        notes = p_new_notes,
        quantity = p_new_quantity
    WHERE id = v_old_item.id;
END;
$$ LANGUAGE plpgsql;

-- 4. Create internal production (v3)
CREATE OR REPLACE FUNCTION create_internal_production_v3(
    p_product_id UUID,
    p_target_product_id UUID,
    p_fabric_meters_per_unit DECIMAL,
    p_quantity DECIMAL,
    p_tailor_id UUID,
    p_tailoring_cost_per_unit DECIMAL,
    p_date DATE,
    p_notes TEXT,
    p_tenant_id UUID
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total_fabric DECIMAL;
    v_total_cost DECIMAL;
BEGIN
    v_total_fabric := COALESCE(p_fabric_meters_per_unit, 0) * COALESCE(p_quantity, 0);
    v_total_cost := COALESCE(p_tailoring_cost_per_unit, 0) * COALESCE(p_quantity, 0);

    -- 1. Create Order
    INSERT INTO custom_orders (tenant_id, customer_id, total_price, advance_payment, status, order_date, expected_delivery_date)
    VALUES (p_tenant_id, NULL, 0, 0, 'delivered', p_date, p_date) RETURNING id INTO v_order_id;

    -- 2. Create Order Item
    INSERT INTO custom_order_items (custom_order_id, tenant_id, product_id, target_product_id, tailor_id, fabric_meters, tailoring_cost, notes, quantity)
    VALUES (v_order_id, p_tenant_id, p_product_id, p_target_product_id, p_tailor_id, v_total_fabric, v_total_cost, 
            jsonb_build_object('type', 'internal', 'meters_per_unit', p_fabric_meters_per_unit, 'quantity', p_quantity, 'cost_per_unit', p_tailoring_cost_per_unit, 'notes', p_notes)::text, p_quantity::integer);

    -- 3. Update Raw Material Stock
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - v_total_fabric WHERE id = p_product_id;

    -- 4. Update Finished Product Stock
    IF p_target_product_id IS NOT NULL THEN
        UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity WHERE id = p_target_product_id;
    END IF;

    -- 5. Update Tailor Balance
    IF p_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + v_total_cost WHERE id = p_tailor_id;
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Update internal production (v3)
CREATE OR REPLACE FUNCTION update_internal_production_v3(
    p_order_id UUID,
    p_new_product_id UUID,
    p_new_target_product_id UUID,
    p_new_fabric_meters_per_unit DECIMAL,
    p_new_quantity DECIMAL,
    p_new_tailor_id UUID,
    p_new_tailoring_cost_per_unit DECIMAL,
    p_new_notes TEXT
) RETURNS void AS $$
DECLARE
    v_old_item RECORD;
    v_old_quantity DECIMAL;
    v_old_total_fabric DECIMAL;
    v_new_total_fabric DECIMAL;
    v_new_total_cost DECIMAL;
BEGIN
    SELECT * INTO v_old_item FROM custom_order_items WHERE custom_order_id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    v_old_quantity := COALESCE(v_old_item.quantity, 1);
    v_old_total_fabric := COALESCE(v_old_item.fabric_meters, 0);
    
    v_new_total_fabric := COALESCE(p_new_fabric_meters_per_unit, 0) * COALESCE(p_new_quantity, 0);
    v_new_total_cost := COALESCE(p_new_tailoring_cost_per_unit, 0) * COALESCE(p_new_quantity, 0);

    -- 1. Revert Old & Apply New Raw Material
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + v_old_total_fabric WHERE id = v_old_item.product_id;
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - v_new_total_fabric WHERE id = p_new_product_id;

    -- 2. Revert Old & Apply New Finished Product
    IF v_old_item.target_product_id IS NOT NULL THEN
        UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - v_old_quantity WHERE id = v_old_item.target_product_id;
    END IF;
    IF p_new_target_product_id IS NOT NULL THEN
        UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + COALESCE(p_new_quantity, 0) WHERE id = p_new_target_product_id;
    END IF;

    -- 3. Revert Old & Apply New Tailor Balance
    IF v_old_item.tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) - COALESCE(v_old_item.tailoring_cost, 0) WHERE id = v_old_item.tailor_id;
    END IF;
    IF p_new_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + v_new_total_cost WHERE id = p_new_tailor_id;
    END IF;

    -- 4. Update Record
    UPDATE custom_order_items SET
        product_id = p_new_product_id,
        target_product_id = p_new_target_product_id,
        tailor_id = p_new_tailor_id,
        fabric_meters = v_new_total_fabric,
        tailoring_cost = v_new_total_cost,
        notes = jsonb_build_object('type', 'internal', 'meters_per_unit', p_new_fabric_meters_per_unit, 'quantity', p_new_quantity, 'cost_per_unit', p_new_tailoring_cost_per_unit, 'notes', p_new_notes)::text,
        quantity = p_new_quantity::integer
    WHERE id = v_old_item.id;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
