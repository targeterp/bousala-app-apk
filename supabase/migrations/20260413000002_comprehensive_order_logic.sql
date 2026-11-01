-- Comprehensive Order Logic RPCs

-- 1. Delete and Reverse Order
CREATE OR REPLACE FUNCTION delete_custom_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_debt_registered DECIMAL;
BEGIN
    -- Get order details
    SELECT * INTO v_order FROM custom_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Loop through all order items
    FOR v_item IN SELECT * FROM custom_order_items WHERE custom_order_id = p_order_id LOOP
        -- A. Revert Stock
        IF v_item.product_id IS NOT NULL AND v_item.fabric_meters > 0 THEN
            UPDATE products 
            SET stock_quantity = stock_quantity + v_item.fabric_meters
            WHERE id = v_item.product_id;
        END IF;

        -- B. Revert Tailor Balance
        IF v_item.tailor_id IS NOT NULL AND v_item.tailoring_cost > 0 THEN
            UPDATE tailors 
            SET balance = balance - v_item.tailoring_cost
            WHERE id = v_item.tailor_id;
        END IF;
    END LOOP;

    -- C. Revert Customer Debt (if delivered)
    IF v_order.status = 'delivered' THEN
        v_debt_registered := COALESCE(v_order.total_price, 0) - COALESCE(v_order.paid_amount, 0);
        IF v_debt_registered > 0 AND v_order.customer_id IS NOT NULL THEN
            UPDATE customers 
            SET balance = balance - v_debt_registered 
            WHERE id = v_order.customer_id;
        END IF;
    END IF;

    -- D. Delete Transactions related to this order
    DELETE FROM transactions WHERE reference_id = p_order_id;

    -- E. Delete Items and Order
    DELETE FROM custom_order_items WHERE custom_order_id = p_order_id;
    DELETE FROM custom_orders WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Pay Order Remaining
CREATE OR REPLACE FUNCTION pay_order_remaining(
    p_order_id UUID, 
    p_amount DECIMAL, 
    p_payment_method TEXT,
    p_user_id UUID
)
RETURNS void AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM custom_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Insert Transaction
    INSERT INTO transactions (
        type, amount, reference_type, reference_id, description, 
        date, created_by, tenant_id, payment_method, entity_type, entity_id
    ) VALUES (
        'income', p_amount, 'custom_order_payment', p_order_id,
        'سداد دفعة لطلب تفصيل رقم ' || substr(p_order_id::text, 1, 8),
        CURRENT_DATE, p_user_id, v_order.tenant_id, p_payment_method, 'customer', v_order.customer_id
    );

    -- Update Order
    UPDATE custom_orders 
    SET paid_amount = COALESCE(paid_amount, 0) + p_amount
    WHERE id = p_order_id;

    -- Update Customer Balance ONLY IF DELIVERED
    IF v_order.status = 'delivered' AND v_order.customer_id IS NOT NULL THEN
        UPDATE customers 
        SET balance = balance - p_amount 
        WHERE id = v_order.customer_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Pay Customer Debt (General or Linked)
CREATE OR REPLACE FUNCTION pay_customer_debt(
    p_customer_id UUID, 
    p_amount DECIMAL, 
    p_payment_method TEXT,
    p_user_id UUID,
    p_order_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = p_customer_id;

    -- Insert Transaction
    INSERT INTO transactions (
        type, amount, reference_type, reference_id, description, 
        date, created_by, tenant_id, payment_method, entity_type, entity_id
    ) VALUES (
        'income', p_amount, 'customer_debt_payment', COALESCE(p_order_id, p_customer_id),
        CASE WHEN p_order_id IS NOT NULL 
             THEN 'سداد دين مرتبط بطلب رقم ' || substr(p_order_id::text, 1, 8)
             ELSE 'سداد دين عام' END,
        CURRENT_DATE, p_user_id, v_tenant_id, p_payment_method, 'customer', p_customer_id
    );

    -- Update Customer Balance
    UPDATE customers 
    SET balance = balance - p_amount 
    WHERE id = p_customer_id;

    -- Update Order if linked
    IF p_order_id IS NOT NULL THEN
        UPDATE custom_orders 
        SET paid_amount = COALESCE(paid_amount, 0) + p_amount
        WHERE id = p_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
