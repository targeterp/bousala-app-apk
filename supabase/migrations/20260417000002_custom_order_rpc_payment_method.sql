-- A. Create Custom Order
CREATE OR REPLACE FUNCTION create_custom_order_v2(
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
    INSERT INTO custom_order_items (custom_order_id, tenant_id, product_id, target_product_id, tailor_id, fabric_meters, tailoring_cost, notes)
    VALUES (v_order_id, p_tenant_id, p_product_id, p_target_product_id, p_tailor_id, p_fabric_meters, p_tailoring_cost, p_notes);

    -- 3. Stock: Deduct Raw Material
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - p_fabric_meters WHERE id = p_product_id;

    -- 4. Tailor: Add Balance
    IF p_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + p_tailoring_cost WHERE id = p_tailor_id;
    END IF;

    -- 5. Customer: Add Debt
    v_debt := p_total_price - p_advance_payment;
    IF p_customer_id IS NOT NULL AND v_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_debt WHERE id = p_customer_id;
        
        -- Add transaction for debt to ensure UI correctly calculates customer debt
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

-- B. Update Custom Order (Delta Logic)
CREATE OR REPLACE FUNCTION update_custom_order_v2(
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
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) + v_old_item.fabric_meters WHERE id = v_old_item.product_id;
    UPDATE products SET stock_quantity = COALESCE(stock_quantity, 0) - p_new_fabric_meters WHERE id = p_new_product_id;

    -- 2. Revert Old Tailor Balance & Apply New
    IF v_old_item.tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) - v_old_item.tailoring_cost WHERE id = v_old_item.tailor_id;
    END IF;
    IF p_new_tailor_id IS NOT NULL THEN
        UPDATE tailors SET balance = COALESCE(balance, 0) + p_new_tailoring_cost WHERE id = p_new_tailor_id;
    END IF;

    -- 3. Revert Old Customer Debt & Apply New
    v_old_debt := COALESCE(v_old_order.total_price, 0) - COALESCE(v_old_order.advance_payment, 0);
    IF v_old_order.customer_id IS NOT NULL AND v_old_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) - v_old_debt WHERE id = v_old_order.customer_id;
        DELETE FROM transactions WHERE reference_id = p_order_id AND reference_type = 'custom_order_debt';
    END IF;

    v_new_debt := p_new_total_price - p_new_advance_payment;
    IF p_new_customer_id IS NOT NULL AND v_new_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_new_debt WHERE id = p_new_customer_id;
        
        -- Add transaction for debt to ensure UI correctly calculates customer debt
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
        notes = p_new_notes
    WHERE id = v_old_item.id;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
