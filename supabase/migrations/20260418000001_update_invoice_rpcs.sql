CREATE OR REPLACE FUNCTION update_sale_invoice_v3(
    p_sale_id UUID,
    p_tenant_id UUID,
    p_customer_id UUID,
    p_total_amount DECIMAL,
    p_discount DECIMAL,
    p_paid_amount DECIMAL,
    p_payment_method TEXT,
    p_items JSONB -- Array of { product_id, quantity, unit_price }
) RETURNS VOID AS $$
DECLARE
    v_old_sale RECORD;
    v_old_item RECORD;
    v_old_debt DECIMAL;
    v_new_debt DECIMAL;
    v_item JSONB;
BEGIN
    -- 1. Fetch old sale
    SELECT * INTO v_old_sale FROM sales WHERE id = p_sale_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;

    -- 2. Revert Old Stock
    FOR v_old_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id LOOP
        UPDATE products 
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_old_item.quantity 
        WHERE id = v_old_item.product_id AND tenant_id = p_tenant_id;
    END LOOP;

    -- 3. Revert Old Debt calculation
    -- Notice: old_debt was calculated based on old total_amount, discount, and paid_amount
    v_old_debt := COALESCE(v_old_sale.total_amount, 0) - COALESCE(v_old_sale.discount, 0) - COALESCE(v_old_sale.paid_amount, 0);
    IF v_old_sale.customer_id IS NOT NULL AND v_old_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) - v_old_debt WHERE id = v_old_sale.customer_id;
    END IF;

    -- 4. Delete old related transactions
    DELETE FROM transactions WHERE reference_type = 'sale' AND reference_id = p_sale_id;
    DELETE FROM transactions WHERE reference_type = 'sale_debt' AND reference_id = p_sale_id;

    -- 5. Delete old sale items
    DELETE FROM sale_items WHERE sale_id = p_sale_id;

    -- 6. Update sale header
    UPDATE sales SET
        customer_id = p_customer_id,
        total_amount = p_total_amount,
        discount = COALESCE(p_discount, 0),
        paid_amount = COALESCE(p_paid_amount, 0),
        payment_method = p_payment_method
    WHERE id = p_sale_id;

    -- 7. Insert new items and apply new stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO sale_items (
            tenant_id,
            sale_id,
            product_id,
            quantity,
            unit_price
        ) VALUES (
            p_tenant_id,
            p_sale_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL
        );

        UPDATE products 
        SET stock_quantity = COALESCE(stock_quantity, 0) - (v_item->>'quantity')::DECIMAL 
        WHERE id = (v_item->>'product_id')::UUID AND tenant_id = p_tenant_id;
    END LOOP;

    -- 8. Apply New Debt calculation
    v_new_debt := p_total_amount - COALESCE(p_discount, 0) - COALESCE(p_paid_amount, 0);
    IF p_customer_id IS NOT NULL AND v_new_debt > 0 THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_new_debt WHERE id = p_customer_id;
        
        -- Insert new debt transaction
        INSERT INTO transactions (
            tenant_id,
            type,
            amount,
            reference_type,
            reference_id,
            entity_type,
            entity_id,
            description,
            payment_method
        ) VALUES (
            p_tenant_id,
            'expense',
            v_new_debt,
            'sale_debt',
            p_sale_id,
            'customer',
            p_customer_id,
            'متبقي من فاتورة المبيعات #' || LEFT(p_sale_id::TEXT, 8),
            'debt_record'
        );
    END IF;

    -- 9. Insert new payment transaction
    IF COALESCE(p_paid_amount, 0) > 0 THEN
        INSERT INTO transactions (
            tenant_id,
            type,
            amount,
            reference_type,
            reference_id,
            entity_type,
            entity_id,
            description,
            payment_method
        ) VALUES (
            p_tenant_id,
            'income',
            p_paid_amount,
            'sale',
            p_sale_id,
            CASE WHEN p_customer_id IS NOT NULL THEN 'customer' ELSE 'general' END,
            p_customer_id,
            'دفعة مبيعات فاتورة #' || LEFT(p_sale_id::TEXT, 8),
            p_payment_method
        );
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION update_purchase_invoice_v3(
    p_purchase_id UUID,
    p_tenant_id UUID,
    p_supplier_id UUID,
    p_total_amount DECIMAL,
    p_paid_amount DECIMAL,
    p_payment_method TEXT,
    p_items JSONB -- Array of { product_id, quantity, unit_price }
) RETURNS VOID AS $$
DECLARE
    v_old_purchase RECORD;
    v_old_item RECORD;
    v_old_debt DECIMAL;
    v_new_debt DECIMAL;
    v_item JSONB;
BEGIN
    -- 1. Fetch old purchase
    SELECT * INTO v_old_purchase FROM purchases WHERE id = p_purchase_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;

    -- 2. Revert Old Stock
    FOR v_old_item IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id LOOP
        UPDATE products 
        SET stock_quantity = COALESCE(stock_quantity, 0) - v_old_item.quantity 
        WHERE id = v_old_item.product_id AND tenant_id = p_tenant_id;
    END LOOP;

    -- 3. Revert Old Debt calculation
    v_old_debt := COALESCE(v_old_purchase.total_amount, 0) - COALESCE(v_old_purchase.paid_amount, 0);
    IF v_old_purchase.supplier_id IS NOT NULL AND v_old_debt > 0 THEN
        UPDATE suppliers SET balance = COALESCE(balance, 0) + v_old_debt WHERE id = v_old_purchase.supplier_id;
    END IF;

    -- 4. Delete old related transactions
    DELETE FROM transactions WHERE reference_type = 'purchase' AND reference_id = p_purchase_id;

    -- 5. Delete old purchase items
    DELETE FROM purchase_items WHERE purchase_id = p_purchase_id;

    -- 6. Update purchase header
    UPDATE purchases SET
        supplier_id = p_supplier_id,
        total_amount = p_total_amount,
        paid_amount = COALESCE(p_paid_amount, 0),
        payment_method = p_payment_method
    WHERE id = p_purchase_id;

    -- 7. Insert new items and apply new stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO purchase_items (
            tenant_id,
            purchase_id,
            product_id,
            quantity,
            unit_price
        ) VALUES (
            p_tenant_id,
            p_purchase_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL
        );

        UPDATE products 
        SET 
            stock_quantity = COALESCE(stock_quantity, 0) + (v_item->>'quantity')::DECIMAL,
            purchase_price = (v_item->>'unit_price')::DECIMAL -- Update last purchase price
        WHERE id = (v_item->>'product_id')::UUID AND tenant_id = p_tenant_id;
    END LOOP;

    -- 8. Apply New Debt calculation
    v_new_debt := p_total_amount - COALESCE(p_paid_amount, 0);
    IF p_supplier_id IS NOT NULL AND v_new_debt > 0 THEN
        UPDATE suppliers SET balance = COALESCE(balance, 0) - v_new_debt WHERE id = p_supplier_id;
    END IF;

    -- 9. Insert new payment transaction
    IF COALESCE(p_paid_amount, 0) > 0 THEN
        INSERT INTO transactions (
            tenant_id,
            type,
            amount,
            reference_type,
            reference_id,
            entity_type,
            entity_id,
            description,
            payment_method
        ) VALUES (
            p_tenant_id,
            'expense',
            p_paid_amount,
            'purchase',
            p_purchase_id,
            CASE WHEN p_supplier_id IS NOT NULL THEN 'supplier' ELSE 'general' END,
            p_supplier_id,
            'دفعة مشتريات فاتورة #' || LEFT(p_purchase_id::TEXT, 8),
            p_payment_method
        );
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
