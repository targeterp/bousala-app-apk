-- =========================================================================
-- Step 2: Update RLS Policies to use the new RBAC logic
-- =========================================================================

-- We will drop the hardcoded "tenant_id = auth.uid()" policies 
-- and replace them with "tenant_id = public.get_current_tenant_id()"

DO $$ 
DECLARE
    table_name_var text;
    tables_list text[] := ARRAY[
        'customers', 'suppliers', 'products', 'sales', 'sale_items', 
        'expenses', 'expense_categories', 'purchases', 'purchase_items', 
        'supplier_payments', 'transactions', 'tailors', 'custom_orders', 
        'custom_order_items', 'tailor_payments', 'employees', 'categories'
    ];
BEGIN
    FOREACH table_name_var IN ARRAY tables_list
    LOOP
        -- Drop the old policy if it exists (catching the common name used before)
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation" ON public.%I', table_name_var);
        
        -- Create the new smart policy
        EXECUTE format(
            'CREATE POLICY "Tenant Isolation RBAC" ON public.%I FOR ALL USING (tenant_id = public.get_current_tenant_id())', 
            table_name_var
        );
    END LOOP;
END $$;

-- Update the policy for 'profiles' table (special case since it uses 'id' instead of 'tenant_id')
DROP POLICY IF EXISTS "Tenant Isolation" ON public.profiles;
CREATE POLICY "Tenant Isolation RBAC" ON public.profiles FOR ALL 
USING (id = public.get_current_tenant_id() OR id = auth.uid());

-- Reload the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
