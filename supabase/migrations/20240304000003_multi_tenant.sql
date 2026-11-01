-- 1. Add tenant_id to all tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE tailors ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE custom_order_items ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE tailor_payments ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT auth.uid();

-- 2. Drop unique constraint on expense_categories name and add composite unique constraint
ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_tenant_id_name_key UNIQUE (tenant_id, name);

-- 3. Update existing rows to the first user in auth.users
DO $$
DECLARE
  first_user UUID;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
  
  IF first_user IS NOT NULL THEN
    UPDATE customers SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE suppliers SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE products SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE sales SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE sale_items SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE expenses SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE expense_categories SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE purchases SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE purchase_items SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE supplier_payments SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE transactions SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE tailors SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE custom_orders SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE custom_order_items SET tenant_id = first_user WHERE tenant_id IS NULL;
    UPDATE tailor_payments SET tenant_id = COALESCE(created_by, first_user) WHERE tenant_id IS NULL;
    UPDATE employees SET tenant_id = first_user WHERE tenant_id IS NULL;
  END IF;
END $$;

-- 4. Drop old permissive policies
DROP POLICY IF EXISTS "Allow all for authenticated" ON profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON customers;
DROP POLICY IF EXISTS "Allow all for authenticated" ON suppliers;
DROP POLICY IF EXISTS "Allow all for authenticated" ON products;
DROP POLICY IF EXISTS "Allow all for authenticated" ON sales;
DROP POLICY IF EXISTS "Allow all for authenticated" ON sale_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON expenses;
DROP POLICY IF EXISTS "Allow all for authenticated" ON expense_categories;
DROP POLICY IF EXISTS "Allow all for authenticated" ON purchases;
DROP POLICY IF EXISTS "Allow all for authenticated" ON purchase_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON supplier_payments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON transactions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON tailors;
DROP POLICY IF EXISTS "Allow all for authenticated" ON custom_orders;
DROP POLICY IF EXISTS "Allow all for authenticated" ON custom_order_items;
DROP POLICY IF EXISTS "Allow all for authenticated" ON tailor_payments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON employees;

-- 5. Create new tenant-isolated policies
CREATE POLICY "Tenant Isolation" ON profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Tenant Isolation" ON customers FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON suppliers FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON products FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON sales FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON sale_items FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON expenses FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON expense_categories FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON purchases FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON purchase_items FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON supplier_payments FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON transactions FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON tailors FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON custom_orders FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON custom_order_items FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON tailor_payments FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenant Isolation" ON employees FOR ALL USING (tenant_id = auth.uid());

-- 6. Trigger to create default expense categories for new users
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- 7. Reload schema cache
NOTIFY pgrst, 'reload schema';
