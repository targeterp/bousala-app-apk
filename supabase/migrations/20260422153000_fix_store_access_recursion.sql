-- Fix infinite recursion in store_user_access policy
-- 1. Create a security definer function to check admin status safely
CREATE OR REPLACE FUNCTION public.is_admin_of_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The owner is always admin of their own tenant
  IF auth.uid() = p_tenant_id THEN
    RETURN true;
  END IF;

  -- Check if user is an active admin employee
  RETURN EXISTS (
    SELECT 1 
    FROM public.store_user_access 
    WHERE user_id = auth.uid() 
      AND tenant_id = p_tenant_id 
      AND access_role = 'admin' 
      AND is_active = true
  );
END;
$$;

-- 2. Drop old policies from store_user_access
DROP POLICY IF EXISTS "Admins can manage their store access rules" ON public.store_user_access;
DROP POLICY IF EXISTS "Users can read their own access rules" ON public.store_user_access;

-- 3. Create new hardened policies for store_user_access
-- A. Admins and Owners can manage all access for their store
CREATE POLICY "Admins manage store access" 
ON public.store_user_access
FOR ALL
USING (public.is_admin_of_tenant(tenant_id));

-- B. Any user can view their own record (for login/role check)
CREATE POLICY "Users view own access" 
ON public.store_user_access
FOR SELECT
USING (user_id = auth.uid());

-- 4. Update the core helper functions to be more robust
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Prioritize the record in store_user_access
  SELECT tenant_id INTO v_tenant_id 
  FROM public.store_user_access 
  WHERE user_id = auth.uid() 
    AND is_active = true 
  LIMIT 1;

  -- Fallback to the user's own ID (assuming they are an owner)
  RETURN COALESCE(v_tenant_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT access_role INTO v_role 
  FROM public.store_user_access 
  WHERE user_id = auth.uid() 
    AND is_active = true 
  LIMIT 1;

  -- Owners are admins
  RETURN COALESCE(v_role, 'admin');
END;
$$;

-- 5. Fix the 'profiles' policy to avoid recursion if it was using get_current_tenant_id()
-- Profiles should be viewable by:
-- - The user themselves
-- - Admins of the same store
DROP POLICY IF EXISTS "Tenant Isolation RBAC" ON public.profiles;
CREATE POLICY "Profiles access" 
ON public.profiles
FOR ALL
USING (
  id = auth.uid() OR 
  public.is_admin_of_tenant(id) OR -- If I am admin of the tenant (owner's profile)
  EXISTS (
    SELECT 1 FROM public.store_user_access 
    WHERE user_id = public.profiles.id 
    AND tenant_id = public.get_current_tenant_id()
  )
);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
