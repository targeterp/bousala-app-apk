-- Migration to consolidate and fix Custom Order triggers
-- This ensures paid_amount is correctly initialized and debt is recorded on delivery.

-- 1. Ensure paid_amount column is robust
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'custom_orders' AND column_name = 'paid_amount') THEN
    ALTER TABLE custom_orders ADD COLUMN paid_amount DECIMAL(12, 2) DEFAULT 0;
  END IF;
  
  -- Ensure it's not null
  ALTER TABLE custom_orders ALTER COLUMN paid_amount SET DEFAULT 0;
  UPDATE custom_orders SET paid_amount = 0 WHERE paid_amount IS NULL;
  ALTER TABLE custom_orders ALTER COLUMN paid_amount SET NOT NULL;
END $$;

-- 2. Function to initialize paid_amount BEFORE insert or update
CREATE OR REPLACE FUNCTION sync_custom_order_paid_amount() RETURNS TRIGGER AS $$
BEGIN
  -- On insert, if paid_amount is 0, initialize it with advance_payment
  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_amount = 0 OR NEW.paid_amount IS NULL THEN
      NEW.paid_amount := COALESCE(NEW.advance_payment, 0);
    END IF;
  END IF;
  
  -- Ensure paid_amount is never less than advance_payment (unless it's a refund case, but let's keep it simple)
  IF NEW.paid_amount < NEW.advance_payment THEN
    NEW.paid_amount := NEW.advance_payment;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_custom_order_paid_amount ON custom_orders;
CREATE TRIGGER trg_sync_custom_order_paid_amount
  BEFORE INSERT OR UPDATE ON custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_custom_order_paid_amount();

-- 3. Consolidated AFTER trigger for transactions and debt
CREATE OR REPLACE FUNCTION process_custom_order_logic() RETURNS TRIGGER AS $$
DECLARE
  remaining_amount DECIMAL(12, 2);
BEGIN
  -- A. Handle Advance Payment Transaction (on INSERT only)
  IF TG_OP = 'INSERT' AND NEW.advance_payment > 0 THEN
    INSERT INTO transactions (
      type, amount, reference_type, reference_id, description, 
      date, created_by, tenant_id, payment_method, entity_type, entity_id
    )
    VALUES (
      'income', NEW.advance_payment, 'custom_order_advance', NEW.id, 
      'دفعة أولية لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), 
      COALESCE(NEW.order_date, CURRENT_DATE), NEW.created_by, NEW.tenant_id, 
      'cash', 'customer', NEW.customer_id
    );
  END IF;

  -- B. Handle Delivery Debt (on UPDATE only)
  IF TG_OP = 'UPDATE' THEN
    -- When status changes to delivered
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
      remaining_amount := COALESCE(NEW.total_price, 0) - COALESCE(NEW.paid_amount, 0);
      
      IF remaining_amount > 0 THEN
        -- 1. Update Customer Balance (Debt)
        IF NEW.customer_id IS NOT NULL THEN
          UPDATE customers SET balance = COALESCE(balance, 0) + remaining_amount WHERE id = NEW.customer_id;
        END IF;

        -- 2. Record Debt in Transactions
        INSERT INTO transactions (
          type, amount, reference_type, reference_id, description, 
          date, created_by, tenant_id, payment_method, entity_type, entity_id
        )
        VALUES (
          'expense', remaining_amount, 'custom_order_debt', NEW.id, 
          'دين متبقي لطلب تفصيل رقم ' || substr(NEW.id::text, 1, 8), 
          CURRENT_DATE, NEW.created_by, NEW.tenant_id, 'cash', 'customer', NEW.customer_id
        );
      END IF;
    END IF;

    -- C. Handle Cancellation (Reverse Debt if it was delivered)
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
      IF OLD.status = 'delivered' THEN
        remaining_amount := COALESCE(OLD.total_price, 0) - COALESCE(OLD.paid_amount, 0);
        IF remaining_amount > 0 AND NEW.customer_id IS NOT NULL THEN
          UPDATE customers SET balance = COALESCE(balance, 0) - remaining_amount WHERE id = NEW.customer_id;
          DELETE FROM transactions WHERE reference_type = 'custom_order_debt' AND reference_id = NEW.id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove old triggers to avoid duplicates
DROP TRIGGER IF EXISTS after_custom_order_insert ON custom_orders;
DROP TRIGGER IF EXISTS after_custom_order_update ON custom_orders;
DROP TRIGGER IF EXISTS on_custom_order_delivery ON custom_orders;
DROP TRIGGER IF EXISTS on_custom_order_advance ON custom_orders;

-- Attach the new consolidated trigger
CREATE TRIGGER trg_custom_order_logic
  AFTER INSERT OR UPDATE ON custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION process_custom_order_logic();

-- 4. Cleanup existing data
-- Ensure all orders have paid_amount set
UPDATE custom_orders SET paid_amount = COALESCE(advance_payment, 0) WHERE paid_amount = 0 OR paid_amount IS NULL;

NOTIFY pgrst, 'reload schema';
