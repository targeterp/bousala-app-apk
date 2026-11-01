-- =========================================================================
-- Step 1: Role-Based Access Control (RBAC) Foundation
-- =========================================================================

-- 1. Create the store_user_access table
-- This table links a system user (user_id) to a specific store (tenant_id) with a role.
CREATE TABLE IF NOT EXISTS public.store_user_access (
    id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL, -- references auth.users(id), the employee logging in
    tenant_id uuid NOT NULL, -- references profiles(id) or the store owner's id
    access_role text NOT NULL CHECK (access_role IN ('admin', 'seller', 'accountant')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid, -- the admin who created this access
    UNIQUE(user_id, tenant_id)
);

-- Note: We do not configure hard foreign keys to auth.users here to avoid potential
-- cross-schema issues unless explicitly handled in Supabase, but it represents auth.uid().

-- Enable RLS on the new table
ALTER TABLE public.store_user_access ENABLE ROW LEVEL SECURITY;

-- Admins can read and manage access rules for their own tenant_id
CREATE POLICY "Admins can manage their store access rules" 
ON public.store_user_access
FOR ALL
USING (tenant_id = auth.uid() OR auth.uid() IN (
    SELECT user_id FROM public.store_user_access WHERE tenant_id = store_user_access.tenant_id AND access_role = 'admin' AND is_active = true
));

-- Users can read their own access rules
CREATE POLICY "Users can read their own access rules" 
ON public.store_user_access
FOR SELECT
USING (user_id = auth.uid());


-- =========================================================================
-- 2. Core Security Functions (Helper Functions for RLS)
-- =========================================================================

-- A. Get the actual tenant_id for the current user
-- If they are an employee, get the owner's tenant_id. Otherwise, they are the owner.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.store_user_access WHERE user_id = auth.uid() AND is_active = true LIMIT 1),
    auth.uid()
  );
$$;

-- B. Get the role for the current user
-- If they are an employee, get their role. Otherwise, default to 'admin' (store owner).
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT access_role FROM public.store_user_access WHERE user_id = auth.uid() AND is_active = true LIMIT 1),
    'admin'
  );
$$;

-- =========================================================================
-- Usage Reminder for the User (Do not execute automatically on existing RLS yet)
-- =========================================================================
-- Note: In the next steps, we will update the RLS policies of Tables (products, sales, etc.)
-- from: "tenant_id = auth.uid()"
-- to: "tenant_id = public.get_current_tenant_id()"
