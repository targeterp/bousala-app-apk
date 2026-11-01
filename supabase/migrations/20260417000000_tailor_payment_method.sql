-- Add payment_method to tailor_payments
ALTER TABLE tailor_payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

CREATE OR REPLACE FUNCTION process_tailor_payment() RETURNS TRIGGER AS $$
DECLARE
  tailor_name TEXT;
  pmethod TEXT;
BEGIN
  -- Decrease what we owe the tailor
  UPDATE tailors
  SET balance = COALESCE(balance, 0) - NEW.amount
  WHERE id = NEW.tailor_id;

  -- Get tailor name
  SELECT name INTO tailor_name FROM tailors WHERE id = NEW.tailor_id;
  
  -- Handle payment_method column if it exists (using JSON fallback or just reading it)
  BEGIN
    pmethod := NEW.payment_method;
  EXCEPTION WHEN OTHERS THEN
    pmethod := 'cash';
  END;

  -- Insert into transactions
  INSERT INTO transactions (type, amount, reference_type, reference_id, description, date, created_by, tenant_id, payment_method, entity_type, entity_id)
  VALUES ('expense', NEW.amount, 'tailor_payment', NEW.id, 'دفعة للخياط: ' || COALESCE(tailor_name, '') || COALESCE(' - ' || NEW.reference_note, ''), COALESCE(NEW.payment_date, NEW.created_at), NEW.created_by, NEW.tenant_id, COALESCE(pmethod, 'cash'), 'general', NULL);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
