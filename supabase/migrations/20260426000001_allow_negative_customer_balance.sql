-- 1. Process Sale: Make sure we update customer balance whether they underpay or overpay
CREATE OR REPLACE FUNCTION process_sale() RETURNS TRIGGER AS $$
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'sale') THEN
    RETURN NEW;
  END IF;

  -- Update customer balance (Add total, subtract paid)
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE customers SET balance = COALESCE(balance, 0) + (NEW.total_amount - NEW.paid_amount) WHERE id = NEW.customer_id;
  END IF;

  -- Record the paid amount as income transaction
  IF COALESCE(NEW.paid_amount, 0) > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_at, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('income', NEW.paid_amount, 'sale', NEW.id, 'دفعة مبيعات فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_at::DATE, NEW.created_at, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;
  
  -- Handle refunds (negative payment means money went out)
  IF COALESCE(NEW.paid_amount, 0) < 0 THEN
      INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_at, created_by, tenant_id, payment_method, entity_type, entity_id)
      VALUES ('expense', ABS(NEW.paid_amount), 'sale_refund', NEW.id, 'إرجاع مبيعات فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_at::DATE, NEW.created_at, NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Process Purchase: Same fix for suppliers
CREATE OR REPLACE FUNCTION process_purchase()
RETURNS trigger AS $$
DECLARE
  supplier_name TEXT;
BEGIN
  -- Prevent duplicate processing
  IF EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id AND reference_type = 'purchase') THEN
    RETURN NEW;
  END IF;

  -- Get supplier name
  SELECT name INTO supplier_name FROM suppliers WHERE id = NEW.supplier_id;

  -- A. Update Supplier Balance (we owe them total - paid)
  UPDATE suppliers 
  SET balance = COALESCE(balance, 0) + (NEW.total_amount - NEW.paid_amount)
  WHERE id = NEW.supplier_id;

  -- B. Record Expense in Transactions (only the paid amount)
  IF COALESCE(NEW.paid_amount, 0) > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id, date)
    VALUES ('expense', ABS(NEW.paid_amount), 'purchase', NEW.id, 'دفعة مشتريات للمورد (' || COALESCE(supplier_name, 'غير معروف') || ') فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), 'supplier', NEW.supplier_id, NEW.created_at::DATE);
  END IF;
  
   -- Handle purchase refunds
  IF COALESCE(NEW.paid_amount, 0) < 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, created_by, tenant_id, payment_method, entity_type, entity_id, date)
    VALUES ('income', ABS(NEW.paid_amount), 'purchase_refund', NEW.id, 'إرجاع مشتريات من المورد (' || COALESCE(supplier_name, 'غير معروف') || ') فاتورة #' || substr(NEW.id::text, 1, 8), NEW.created_by, NEW.tenant_id, COALESCE(NEW.payment_method, 'cash'), 'supplier', NEW.supplier_id, NEW.created_at::DATE);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. update_sale_invoice_v3: Handle updates correctly
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
    v_old_debt := COALESCE(v_old_sale.total_amount, 0) - COALESCE(v_old_sale.discount, 0) - COALESCE(v_old_sale.paid_amount, 0);
    IF v_old_sale.customer_id IS NOT NULL THEN
        UPDATE customers SET balance = COALESCE(balance, 0) - v_old_debt WHERE id = v_old_sale.customer_id;
    END IF;

    -- 4. Delete old related transactions
    DELETE FROM transactions WHERE reference_type IN ('sale', 'sale_refund', 'sale_debt') AND reference_id = p_sale_id;

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
            unit_price,
            total_price
        ) VALUES (
            p_tenant_id,
            p_sale_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL,
            (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL
        );

        UPDATE products 
        SET stock_quantity = COALESCE(stock_quantity, 0) - (v_item->>'quantity')::DECIMAL 
        WHERE id = (v_item->>'product_id')::UUID AND tenant_id = p_tenant_id;
    END LOOP;

    -- 8. Apply New Debt calculation
    v_new_debt := p_total_amount - COALESCE(p_discount, 0) - COALESCE(p_paid_amount, 0);
    IF p_customer_id IS NOT NULL THEN
        UPDATE customers SET balance = COALESCE(balance, 0) + v_new_debt WHERE id = p_customer_id;
        
        IF v_new_debt > 0 THEN
            -- Insert new debt transaction only if it's actual positive debt
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
    ELSIF COALESCE(p_paid_amount, 0) < 0 THEN
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
            ABS(p_paid_amount),
            'sale_refund',
            p_sale_id,
            CASE WHEN p_customer_id IS NOT NULL THEN 'customer' ELSE 'general' END,
            p_customer_id,
            'إرجاع مبيعات فاتورة #' || LEFT(p_sale_id::TEXT, 8),
            p_payment_method
        );
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. update_purchase_invoice_v3: Handle updates correctly
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
    IF v_old_purchase.supplier_id IS NOT NULL THEN
        UPDATE suppliers SET balance = COALESCE(balance, 0) - v_old_debt WHERE id = v_old_purchase.supplier_id;
    END IF;

    -- 4. Delete old related transactions
    DELETE FROM transactions WHERE reference_type IN ('purchase', 'purchase_refund') AND reference_id = p_purchase_id;

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
            unit_price,
            total_price
        ) VALUES (
            p_tenant_id,
            p_purchase_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::DECIMAL,
            (v_item->>'unit_price')::DECIMAL,
            (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL
        );

        UPDATE products 
        SET 
            stock_quantity = COALESCE(stock_quantity, 0) + (v_item->>'quantity')::DECIMAL,
            purchase_price = (v_item->>'unit_price')::DECIMAL -- Update last purchase price
        WHERE id = (v_item->>'product_id')::UUID AND tenant_id = p_tenant_id;
    END LOOP;

    -- 8. Apply New Debt calculation
    v_new_debt := p_total_amount - COALESCE(p_paid_amount, 0);
    IF p_supplier_id IS NOT NULL THEN
        UPDATE suppliers SET balance = COALESCE(balance, 0) + v_new_debt WHERE id = p_supplier_id;
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
    ELSIF COALESCE(p_paid_amount, 0) < 0 THEN
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
            ABS(p_paid_amount),
            'purchase_refund',
            p_purchase_id,
            CASE WHEN p_supplier_id IS NOT NULL THEN 'supplier' ELSE 'general' END,
            p_supplier_id,
            'إرجاع مشتريات من המورد #' || LEFT(p_purchase_id::TEXT, 8),
            p_payment_method
        );
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Process Customer Debt Payments (allow negative to refund credit)
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
    v_transaction_type TEXT;
    v_transaction_amount DECIMAL;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM customers WHERE id = p_customer_id;

    -- Determine if it's income or expense (refund)
    IF p_amount >= 0 THEN
        v_transaction_type := 'income';
        v_transaction_amount := p_amount;
    ELSE
        v_transaction_type := 'expense';
        v_transaction_amount := ABS(p_amount);
    END IF;

    -- Insert Transaction
    INSERT INTO transactions (
        type, amount, reference_type, reference_id, description, 
        date, created_by, tenant_id, payment_method, entity_type, entity_id
    ) VALUES (
        v_transaction_type, v_transaction_amount, 
        CASE WHEN p_amount < 0 THEN 'customer_refund' ELSE 'customer_debt_payment' END, 
        COALESCE(p_order_id, p_customer_id),
        CASE 
             WHEN p_order_id IS NOT NULL THEN 'سداد دين مرتبط بطلب رقم ' || substr(p_order_id::text, 1, 8)
             WHEN p_amount < 0 THEN 'إرجاع رصيد دائن للعميل'
             ELSE 'سداد دين/دفعة مقدمة للعميل' END,
        CURRENT_DATE, p_user_id, v_tenant_id, p_payment_method, 'customer', p_customer_id
    );

    -- Update Customer Balance
    UPDATE customers 
    SET balance = COALESCE(balance, 0) - p_amount 
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
