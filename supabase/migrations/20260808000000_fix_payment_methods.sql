-- Fix missing payment methods for tenants created after the initial payment methods migration
-- and update the trigger to ensure future tenants get them automatically.

BEGIN;

-- 1. Insert default payment methods for all existing profiles that might be missing them
INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default, icon, color, bg)
SELECT id, 'نقدي (كاش)', 'cash', 'cash', true, 'Wallet', 'text-emerald-600', 'bg-emerald-100 dark:bg-emerald-900/30'
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default, icon, color, bg)
SELECT id, 'بنكيلي (Bankily)', 'bankily', 'mobile_money', false, 'Building', 'text-blue-600', 'bg-blue-100 dark:bg-blue-900/30'
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default, icon, color, bg)
SELECT id, 'مصرفي (Masrvi)', 'masrvi', 'mobile_money', false, 'Building', 'text-orange-600', 'bg-orange-100 dark:bg-orange-900/30'
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default, icon, color, bg)
SELECT id, 'سداد (Sedad)', 'sedad', 'mobile_money', false, 'Building', 'text-purple-600', 'bg-purple-100 dark:bg-purple-900/30'
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

-- 2. Update the handle_new_user_setup function to include payment methods
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger AS $$
BEGIN
  -- Insert default expense categories for the new user
  INSERT INTO public.expense_categories (name, tenant_id)
  VALUES 
    ('رواتب', NEW.id),
    ('أجور', NEW.id),
    ('إيجار', NEW.id),
    ('فواتير (كهرباء، ماء، انترنت)', NEW.id),
    ('تسويق', NEW.id),
    ('مستلزمات', NEW.id),
    ('صيانة', NEW.id),
    ('أخرى', NEW.id)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  
  -- Insert default payment methods for the new user
  INSERT INTO public.payment_methods (tenant_id, name, method_id, type, is_default, icon, color, bg)
  VALUES 
    (NEW.id, 'نقدي (كاش)', 'cash', 'cash', true, 'Wallet', 'text-emerald-600', 'bg-emerald-100 dark:bg-emerald-900/30'),
    (NEW.id, 'بنكيلي (Bankily)', 'bankily', 'mobile_money', false, 'Building', 'text-blue-600', 'bg-blue-100 dark:bg-blue-900/30'),
    (NEW.id, 'مصرفي (Masrvi)', 'masrvi', 'mobile_money', false, 'Building', 'text-orange-600', 'bg-orange-100 dark:bg-orange-900/30'),
    (NEW.id, 'سداد (Sedad)', 'sedad', 'mobile_money', false, 'Building', 'text-purple-600', 'bg-purple-100 dark:bg-purple-900/30')
  ON CONFLICT (tenant_id, method_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
