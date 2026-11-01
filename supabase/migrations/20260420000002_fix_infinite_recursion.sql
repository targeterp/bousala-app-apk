-- =========================================================================
-- Step 1.5: Fix Infinite Recursion in RLS Policy
-- =========================================================================

-- The previous policy caused an infinite loop because it queried the same table
-- it was trying to protect inside the USING clause.

-- 1. Drop the problematic policies
DROP POLICY IF EXISTS "Admins can manage their store access rules" ON public.store_user_access;
DROP POLICY IF EXISTS "Users can read their own access rules" ON public.store_user_access;

-- 2. Create the fixed policies
-- A. The store owner (tenant_id) has full access
CREATE POLICY "Tenant owner has full access" 
ON public.store_user_access 
FOR ALL 
USING (tenant_id = auth.uid());

-- B. The employee can view their own link
CREATE POLICY "Employee can view own access" 
ON public.store_user_access 
FOR SELECT 
USING (user_id = auth.uid());

-- C. Allow users with 'admin' role in this tenant to read/write using a non-recursive approach
-- (If you want delegated admins to also add employees). For now, the owner is sufficient.
