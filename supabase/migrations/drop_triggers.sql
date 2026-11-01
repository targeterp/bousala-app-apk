-- Drop triggers that reference paid_amount or duplicate the logic in update_custom_order_status_v2
DROP TRIGGER IF EXISTS trg_sync_custom_order_paid_amount ON custom_orders;
DROP FUNCTION IF EXISTS sync_custom_order_paid_amount();

DROP TRIGGER IF EXISTS trg_custom_order_logic ON custom_orders;
DROP FUNCTION IF EXISTS process_custom_order_logic();

-- Re-create the trigger for advance payment ONLY (since we dropped process_custom_order_logic which handled it)
CREATE OR REPLACE FUNCTION process_custom_order_advance_only() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.advance_payment, 0) > 0 THEN
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_order_advance_only ON custom_orders;
CREATE TRIGGER trg_custom_order_advance_only
  AFTER INSERT ON custom_orders
  FOR EACH ROW
  EXECUTE FUNCTION process_custom_order_advance_only();
