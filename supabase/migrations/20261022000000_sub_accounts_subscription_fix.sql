-- =========================================================================
-- Migration: Sub-Accounts Architecture & Subscription Inheritance Fix
-- Purpose:
-- 1. Ensure sub-accounts inherit their subscription from the main account (tenant)
-- 2. Eliminate standalone 7-day trials for sub-accounts
-- 3. Fix RLS on profiles so sub-accounts can read their store owner's profile
-- 4. Automatically propagate subscription renewals to all sub-accounts
-- 5. Provide a security definer RPC to query real-time store subscription status
-- =========================================================================

-- 1. Fix RLS on public.profiles
DROP POLICY IF EXISTS "Profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Tenant Isolation RBAC" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.profiles;

CREATE POLICY "Profiles access" 
ON public.profiles
FOR ALL
USING (
  -- A user can always view/edit their own profile
  id = auth.uid() 
  -- An active employee can always read their store owner's profile
  OR id = public.get_current_tenant_id()
  -- An admin/owner can view their store's profile
  OR public.is_admin_of_tenant(id)
  -- Store members can view profiles of other team members in the same store
  OR EXISTS (
    SELECT 1 FROM public.store_user_access 
    WHERE user_id = public.profiles.id 
    AND tenant_id = public.get_current_tenant_id()
  )
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create RPC to check real-time subscription status for the store
CREATE OR REPLACE FUNCTION public.get_store_subscription_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_role text;
  v_is_sub boolean := false;
  v_owner_profile record;
  v_is_expired boolean := false;
  v_days_left integer := 0;
  v_current_user record;
BEGIN
  -- Check if user is logged in
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated', 'is_expired', true);
  END IF;

  -- Check if user is an employee in store_user_access
  SELECT tenant_id, access_role, is_active INTO v_tenant_id, v_user_role, v_is_sub
  FROM public.store_user_access
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_tenant_id IS NOT NULL AND v_tenant_id <> auth.uid() THEN
    -- User is a sub-account
    v_is_sub := true;
    
    -- Check if deactivated by store owner
    IF v_user_role IS NULL OR NOT (SELECT is_active FROM public.store_user_access WHERE user_id = auth.uid() AND tenant_id = v_tenant_id LIMIT 1) THEN
      RETURN jsonb_build_object(
        'is_expired', true,
        'is_deactivated', true,
        'is_sub_account', true,
        'message', 'تم تعطيل الحساب من قبل مدير المتجر'
      );
    END IF;
  ELSE
    v_tenant_id := auth.uid();
    v_user_role := 'admin';
    v_is_sub := false;
  END IF;

  -- Fetch store owner profile
  SELECT id, full_name, business_name, subscription_plan, subscription_end_date
  INTO v_owner_profile
  FROM public.profiles
  WHERE id = v_tenant_id;

  -- If owner profile not found fallback to default
  IF v_owner_profile IS NULL THEN
    RETURN jsonb_build_object(
      'is_expired', false,
      'is_sub_account', v_is_sub,
      'tenant_id', v_tenant_id,
      'subscription_plan', 'trial',
      'days_remaining', 7,
      'role', COALESCE(v_user_role, 'admin'),
      'business_name', 'متجري'
    );
  END IF;

  -- Calculate expiration
  IF v_owner_profile.subscription_end_date IS NULL OR v_owner_profile.subscription_end_date < NOW() THEN
    v_is_expired := true;
    v_days_left := 0;
  ELSE
    v_is_expired := false;
    v_days_left := CEIL(EXTRACT(EPOCH FROM (v_owner_profile.subscription_end_date - NOW())) / 86400.0)::integer;
  END IF;

  RETURN jsonb_build_object(
    'is_expired', v_is_expired,
    'is_deactivated', false,
    'is_sub_account', v_is_sub,
    'tenant_id', v_tenant_id,
    'subscription_plan', COALESCE(v_owner_profile.subscription_plan, 'trial'),
    'subscription_end_date', v_owner_profile.subscription_end_date,
    'days_remaining', v_days_left,
    'role', COALESCE(v_user_role, 'admin'),
    'business_name', COALESCE(v_owner_profile.business_name, 'متجري')
  );
END;
$$;

-- 3. Update handle_new_user() trigger to inherit subscription for sub-accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_is_sub boolean := false;
  v_parent_tenant_id uuid;
  v_owner_plan text := 'trial';
  v_owner_end_date timestamptz := NOW() + INTERVAL '7 days';
  v_owner_business text := NULL;
  v_member_role text := 'admin';
BEGIN
  -- Check if metadata specifies sub-account creation
  IF (NEW.raw_user_meta_data->>'is_sub_account')::boolean = true THEN
    v_is_sub := true;
    v_parent_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
    v_member_role := COALESCE(NEW.raw_user_meta_data->>'role', 'seller');

    IF v_parent_tenant_id IS NOT NULL THEN
      -- Inherit the store owner's subscription details directly!
      SELECT subscription_plan, subscription_end_date, business_name
      INTO v_owner_plan, v_owner_end_date, v_owner_business
      FROM public.profiles
      WHERE id = v_parent_tenant_id;
    END IF;

    INSERT INTO public.profiles (id, full_name, role, subscription_plan, subscription_end_date, business_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'موظف'),
      v_member_role,
      'sub_account',
      COALESCE(v_owner_end_date, NOW() + INTERVAL '7 days'),
      v_owner_business
    )
    ON CONFLICT (id) DO UPDATE SET
      role = v_member_role,
      subscription_plan = 'sub_account',
      subscription_end_date = COALESCE(v_owner_end_date, NOW() + INTERVAL '7 days'),
      business_name = v_owner_business;

    RETURN NEW;
  END IF;

  -- Standard main account signup (gives 7 days trial to the store owner)
  INSERT INTO public.profiles (id, full_name, role, subscription_plan, subscription_end_date)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'مستخدم'),
    'admin',
    'trial',
    NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (id) DO UPDATE SET
    subscription_plan = 'trial',
    subscription_end_date = NOW() + INTERVAL '7 days'
  WHERE profiles.subscription_plan = 'trial' AND profiles.subscription_end_date > NOW() + INTERVAL '7 days';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to synchronize all sub-accounts of a store with the owner's subscription
CREATE OR REPLACE FUNCTION public.sync_store_sub_accounts(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner record;
  v_updated_count integer := 0;
BEGIN
  -- Verify caller is admin of tenant
  IF NOT public.is_admin_of_tenant(p_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT subscription_plan, subscription_end_date, business_name 
  INTO v_owner 
  FROM public.profiles 
  WHERE id = p_tenant_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Owner profile not found');
  END IF;

  UPDATE public.profiles
  SET subscription_end_date = v_owner.subscription_end_date,
      subscription_plan = 'sub_account',
      business_name = COALESCE(v_owner.business_name, public.profiles.business_name)
  WHERE id IN (
    SELECT user_id FROM public.store_user_access WHERE tenant_id = p_tenant_id
  );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 
    'updated_count', v_updated_count,
    'subscription_end_date', v_owner.subscription_end_date
  );
END;
$$;

-- 5. Update redeem_subscription_voucher to propagate new expiry to all sub-accounts
CREATE OR REPLACE FUNCTION redeem_subscription_voucher(p_voucher_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher RECORD;
  v_current_end_date TIMESTAMPTZ;
  v_new_end_date TIMESTAMPTZ;
  v_days INT;
  v_tenant_id UUID;
BEGIN
  -- Find voucher
  SELECT * INTO v_voucher
  FROM subscription_vouchers
  WHERE code = UPPER(p_voucher_code) AND is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'رمز القسيمة غير صالح أو تم استخدامه مسبقاً');
  END IF;

  -- Determine days to add
  IF v_voucher.plan_type = 'monthly' THEN
    v_days := 30;
  ELSIF v_voucher.plan_type = 'annual' THEN
    v_days := 365;
  ELSE
    v_days := 30;
  END IF;

  -- Store owner ID
  v_tenant_id := public.get_current_tenant_id();

  -- Get current subscription end date
  SELECT subscription_end_date INTO v_current_end_date
  FROM profiles
  WHERE id = v_tenant_id;

  -- Calculate new end date
  IF v_current_end_date IS NULL OR v_current_end_date < NOW() THEN
    v_new_end_date := NOW() + (v_days || ' days')::INTERVAL;
  ELSE
    v_new_end_date := v_current_end_date + (v_days || ' days')::INTERVAL;
  END IF;

  -- Update owner profile
  UPDATE profiles
  SET subscription_end_date = v_new_end_date,
      subscription_plan = v_voucher.plan_type
  WHERE id = v_tenant_id;

  -- Automatically update all sub-accounts of this store!
  UPDATE profiles
  SET subscription_end_date = v_new_end_date,
      subscription_plan = 'sub_account'
  WHERE id IN (
    SELECT user_id FROM store_user_access WHERE tenant_id = v_tenant_id
  );

  -- Mark voucher as used
  UPDATE subscription_vouchers
  SET is_used = true,
      used_by = auth.uid(),
      used_at = NOW()
  WHERE id = v_voucher.id;

  RETURN json_build_object('success', true, 'message', 'تم تفعيل الاشتراك وتحديث جميع الحسابات التابعة بنجاح');
END;
$$;

-- Reload schema
NOTIFY pgrst, 'reload schema';
