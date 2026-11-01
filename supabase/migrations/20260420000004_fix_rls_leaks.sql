-- =========================================================================
-- Step 4: Ensure All Old Policies are Dropped
-- =========================================================================

-- It appears some older policies like "Allow all for authenticated" 
-- might still exist and are causing data to leak across tenants.
-- We will aggressively drop any known overly permissive policies.

DO $$ 
DECLARE
    table_name_var text;
    tables_list text[] := ARRAY[
        'customers', 'suppliers', 'products', 'sales', 'sale_items', 
        'expenses', 'expense_categories', 'purchases', 'purchase_items', 
        'supplier_payments', 'transactions', 'tailors', 'custom_orders', 
        'custom_order_items', 'tailor_payments', 'employees', 'categories',
        'partners'
    ];
BEGIN
    FOREACH table_name_var IN ARRAY tables_list
    LOOP
        -- Drop aggressively
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', table_name_var);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation" ON public.%I', table_name_var);
        
        -- Re-affirm the new RBAC policies just in case they were missing
        -- First drop to ensure clean state
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation RBAC" ON public.%I', table_name_var);
        
        -- Create the new smart policy
        EXECUTE format(
            'CREATE POLICY "Tenant Isolation RBAC" ON public.%I FOR ALL USING (tenant_id = public.get_current_tenant_id())', 
            table_name_var
        );

        -- Also ensure RLS is actually enabled!
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name_var);
    END LOOP;
END $$;

-- Fix 'profiles' table
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Isolation RBAC" ON public.profiles;
CREATE POLICY "Tenant Isolation RBAC" ON public.profiles FOR ALL 
USING (id = public.get_current_tenant_id() OR id = auth.uid());
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Reload the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
