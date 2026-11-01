-- Migration to handle Custom Order Debts and Edit/Cancel functionality

-- 1. Add paid_amount to custom_orders if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_orders' AND column_name = 'paid_amount') THEN
    ALTER TABLE custom_orders ADD COLUMN paid_amount DECIMAL(12, 2) DEFAULT 0;
  END IF;
END $$;

-- 2. Update existing orders to set paid_amount = advance_payment
UPDATE custom_orders SET paid_amount = advance_payment WHERE paid_amount = 0 AND advance_payment > 0;

-- 3. Update process_custom_order_advance to update paid_amount
CREATE OR REPLACE FUNCTION process_custom_order_advance() RETURNS TRIGGER AS $$
BEGIN
  -- Update paid_amount
  UPDATE custom_orders SET paid_amount = NEW.advance_payment WHERE id = NEW.id;

  IF NEW.advance_payment > 0 THEN
    INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
    VALUES ('income', NEW.advance_payment, 'custom_order_advance', NEW.id, 'دفعة أولية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), NEW.order_date, NEW.created_by, NEW.tenant_id, 'cash', CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Update process_custom_order_delivery to record debt instead of immediate income
CREATE OR REPLACE FUNCTION process_custom_order_delivery() RETURNS TRIGGER AS $$
DECLARE
  remaining_amount DECIMAL(12, 2);
BEGIN
  -- When status changes to delivered
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    remaining_amount := NEW.total_price - NEW.paid_amount;
    
    IF remaining_amount > 0 THEN
      -- A. Update Customer Balance (Debt)
      IF NEW.customer_id IS NOT NULL THEN
        UPDATE customers SET balance = balance + remaining_amount WHERE id = NEW.customer_id;
      END IF;

      -- B. Record Debt in Transactions (as 'expense' type for customer debt tracking)
      INSERT INTO transactions (
        type, amount, reference_type, reference_id, description, 
        date, created_by, tenant_id, payment_method, entity_type, entity_id
      )
      VALUES (
        'expense', remaining_amount, 'custom_order_debt', NEW.id, 
        'دين متبقي لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), 
        CURRENT_DATE, NEW.created_by, NEW.tenant_id, 'cash', 
        CASE WHEN NEW.customer_id IS NOT NULL THEN 'customer' ELSE 'general' END, 
        NEW.customer_id
      );
    END IF;
  END IF;

  -- Handle Cancellation (if status changes to 'cancelled')
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- If it was delivered, we need to reverse the debt
    IF OLD.status = 'delivered' THEN
      remaining_amount := OLD.total_price - OLD.paid_amount;
      IF remaining_amount > 0 AND NEW.customer_id IS NOT NULL THEN
        UPDATE customers SET balance = balance - remaining_amount WHERE id = NEW.customer_id;
        -- Delete the debt transaction
        DELETE FROM transactions WHERE reference_type = 'custom_order_debt' AND reference_id = NEW.id;
      END IF;
    END IF;
    
    -- Refund advance payment? (Optional, usually depends on policy, but let's keep it simple for now)
    -- For now, we just stop production.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Add a function to handle order payments (from debt)
CREATE OR REPLACE FUNCTION process_custom_order_payment() RETURNS TRIGGER AS $$
BEGIN
  -- This trigger would be on transactions table if we wanted to link them, 
  -- but it's easier to just update the order's paid_amount when a transaction is created.
  -- However, we'll do this via frontend logic for now to keep it simple, 
  -- or we can add a trigger on transactions.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Ensure the trigger is attached correctly
DROP TRIGGER IF EXISTS on_custom_order_delivery ON custom_orders;
CREATE TRIGGER on_custom_order_delivery
  AFTER UPDATE ON custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION process_custom_order_delivery();

-- Function to decrement customer balance
CREATE OR REPLACE FUNCTION decrement_customer_balance(customer_id UUID, amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE customers
  SET balance = balance - amount
  WHERE id = customer_id;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
