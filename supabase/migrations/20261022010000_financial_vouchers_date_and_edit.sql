-- =========================================================================
-- Migration: Financial Vouchers Date Support & Customer Payment Edit
-- Purpose:
-- 1. Support custom transaction date and description in pay_customer_debt
-- 2. Provide atomic database transaction function for editing customer payment vouchers
-- =========================================================================

-- 1. Updated pay_customer_debt with date & description support
CREATE OR REPLACE FUNCTION pay_customer_debt(
    p_customer_id UUID, 
    p_amount DECIMAL, 
    p_payment_method TEXT,
    p_user_id UUID,
    p_order_id UUID DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE,
    p_description TEXT DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_tenant_id UUID;
    v_transaction_type TEXT;
    v_transaction_amount DECIMAL;
    v_desc TEXT;
    v_tx_id UUID;
    v_tx_date DATE;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = p_customer_id;
    IF v_tenant_id IS NULL THEN
        v_tenant_id := p_user_id;
    END IF;

    v_tx_date := COALESCE(p_date, CURRENT_DATE);

    -- Determine if it's income or expense (refund)
    IF p_amount >= 0 THEN
        v_transaction_type := 'income';
        v_transaction_amount := p_amount;
    ELSE
        v_transaction_type := 'expense';
        v_transaction_amount := ABS(p_amount);
    END IF;

    -- Determine description
    IF p_description IS NOT NULL AND trim(p_description) <> '' THEN
        v_desc := trim(p_description);
    ELSE
        IF p_order_id IS NOT NULL THEN
            v_desc := 'سداد دين مرتبط بطلب رقم ' || substr(p_order_id::text, 1, 8);
        ELSIF p_amount < 0 THEN
            v_desc := 'إرجاع رصيد دائن للعميل';
        ELSE
            v_desc := 'سداد دين/دفعة مقدمة للعميل';
        END IF;
    END IF;

    -- Insert Transaction
    INSERT INTO transactions (
        type, amount, reference_type, reference_id, description, 
        date, created_at, created_by, tenant_id, payment_method, entity_type, entity_id
    ) VALUES (
        v_transaction_type, v_transaction_amount, 
        CASE WHEN p_amount < 0 THEN 'customer_refund' ELSE 'customer_debt_payment' END, 
        COALESCE(p_order_id, p_customer_id),
        v_desc,
        v_tx_date, 
        (v_tx_date::text || ' ' || to_char(NOW(), 'HH24:MI:SSOF'))::timestamptz,
        p_user_id, v_tenant_id, p_payment_method, 'customer', p_customer_id
    )
    RETURNING id INTO v_tx_id;

    -- Update Customer Balance (debt decreases when amount paid is positive)
    UPDATE customers 
    SET balance = COALESCE(balance, 0) - p_amount 
    WHERE id = p_customer_id;

    -- Update Order if linked
    IF p_order_id IS NOT NULL THEN
        UPDATE custom_orders 
        SET paid_amount = COALESCE(paid_amount, 0) + p_amount
        WHERE id = p_order_id;
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atomic Function to Edit Customer Payment Voucher
CREATE OR REPLACE FUNCTION edit_customer_payment_transaction(
    p_transaction_id UUID,
    p_new_amount DECIMAL,
    p_new_date DATE,
    p_new_description TEXT,
    p_new_payment_method TEXT
)
RETURNS jsonb AS $$
DECLARE
    v_tx RECORD;
    v_diff DECIMAL;
    v_new_created_at TIMESTAMPTZ;
BEGIN
    -- 1. Fetch current transaction
    SELECT * INTO v_tx
    FROM transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المعاملة غير موجودة');
    END IF;

    IF p_new_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'المبلغ يجب أن يكون أكبر من صفر');
    END IF;

    -- Difference between new amount and old amount
    v_diff := p_new_amount - v_tx.amount;

    -- Adjust timestamp with preserved time or now
    IF p_new_date IS NOT NULL THEN
        v_new_created_at := (p_new_date::text || ' ' || to_char(COALESCE(v_tx.created_at, NOW()), 'HH24:MI:SSOF'))::timestamptz;
    ELSE
        v_new_created_at := v_tx.created_at;
    END IF;

    -- 2. Update Customer Balance
    -- If it was income (receipt), an increase in amount reduces the customer debt further
    IF v_tx.entity_type = 'customer' AND v_tx.entity_id IS NOT NULL THEN
        IF v_tx.type = 'income' THEN
            UPDATE customers 
            SET balance = COALESCE(balance, 0) - v_diff
            WHERE id = v_tx.entity_id;
        ELSIF v_tx.type = 'expense' THEN
            -- If it was an expense (refund), an increase in refund increases the customer debt
            UPDATE customers 
            SET balance = COALESCE(balance, 0) + v_diff
            WHERE id = v_tx.entity_id;
        END IF;

        -- If linked to custom order
        IF v_tx.reference_type = 'custom_order_payment' OR v_tx.reference_id <> v_tx.entity_id THEN
            IF EXISTS (SELECT 1 FROM custom_orders WHERE id = v_tx.reference_id) THEN
                UPDATE custom_orders
                SET paid_amount = COALESCE(paid_amount, 0) + v_diff
                WHERE id = v_tx.reference_id;
            END IF;
        END IF;
    END IF;

    -- 3. Update the Transaction record
    UPDATE transactions
    SET amount = p_new_amount,
        date = COALESCE(p_new_date, v_tx.date),
        created_at = v_new_created_at,
        description = COALESCE(p_new_description, v_tx.description),
        payment_method = COALESCE(p_new_payment_method, v_tx.payment_method)
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم تعديل السند وتحديث رصيد العميل بنجاح',
        'diff', v_diff
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to Delete Customer Payment Voucher safely
CREATE OR REPLACE FUNCTION delete_customer_payment_transaction(
    p_transaction_id UUID
)
RETURNS jsonb AS $$
DECLARE
    v_tx RECORD;
BEGIN
    SELECT * INTO v_tx
    FROM transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'المعاملة غير موجودة');
    END IF;

    -- Revert balance
    IF v_tx.entity_type = 'customer' AND v_tx.entity_id IS NOT NULL THEN
        IF v_tx.type = 'income' THEN
            -- Reverting income means customer debt increases back by the amount
            UPDATE customers 
            SET balance = COALESCE(balance, 0) + v_tx.amount
            WHERE id = v_tx.entity_id;
        ELSIF v_tx.type = 'expense' THEN
            -- Reverting expense means customer debt decreases back
            UPDATE customers 
            SET balance = COALESCE(balance, 0) - v_tx.amount
            WHERE id = v_tx.entity_id;
        END IF;

        -- If linked to custom order
        IF v_tx.reference_id IS NOT NULL AND v_tx.reference_id <> v_tx.entity_id THEN
            IF EXISTS (SELECT 1 FROM custom_orders WHERE id = v_tx.reference_id) THEN
                UPDATE custom_orders
                SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_tx.amount)
                WHERE id = v_tx.reference_id;
            END IF;
        END IF;
    END IF;

    DELETE FROM transactions WHERE id = p_transaction_id;

    RETURN jsonb_build_object('success', true, 'message', 'تم حذف السند وإلغاء أثره المالي بنجاح');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
