-- Migration: Document Supplier Payment Update & Delete Logic
-- This migration ensures that updating or deleting supplier_payments 
-- safely adjusts the supplier's balance and keeps the transactions table in sync.

-- 1. Function to revert supplier balance and delete transactions on payment deletion
CREATE OR REPLACE FUNCTION process_supplier_payment_delete()
RETURNS trigger AS $$
BEGIN
  -- Revert Supplier Balance (increase balance/debt since payment was deleted)
  UPDATE suppliers 
  SET balance = COALESCE(balance, 0) + OLD.amount
  WHERE id = OLD.supplier_id;

  -- Delete associated transaction in financial ledger
  DELETE FROM transactions 
  WHERE reference_type = 'supplier_payment' AND reference_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_supplier_payment_delete ON supplier_payments;
CREATE TRIGGER after_supplier_payment_delete
  AFTER DELETE ON supplier_payments
  FOR EACH ROW EXECUTE PROCEDURE process_supplier_payment_delete();

-- 2. Function to adjust supplier balance and update transactions on payment update
CREATE OR REPLACE FUNCTION process_supplier_payment_update()
RETURNS trigger AS $$
DECLARE
  diff NUMERIC;
BEGIN
  diff := NEW.amount - OLD.amount;

  -- Update Supplier Balance by difference (if diff > 0, debt decreases; if diff < 0, debt increases)
  IF diff <> 0 THEN
    UPDATE suppliers 
    SET balance = COALESCE(balance, 0) - diff
    WHERE id = NEW.supplier_id;
  END IF;

  -- Update associated transaction in financial ledger
  UPDATE transactions 
  SET 
    amount = NEW.amount,
    payment_method = COALESCE(NEW.payment_method, transactions.payment_method)
  WHERE reference_type = 'supplier_payment' AND reference_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_supplier_payment_update ON supplier_payments;
CREATE TRIGGER after_supplier_payment_update
  AFTER UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE PROCEDURE process_supplier_payment_update();

NOTIFY pgrst, 'reload schema';
