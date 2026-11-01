ALTER TABLE public.store_user_access 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_current_user_permissions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_perms jsonb;
BEGIN
  SELECT access_role, permissions INTO v_role, v_perms 
  FROM public.store_user_access 
  WHERE user_id = auth.uid() 
    AND is_active = true 
  LIMIT 1;
  
  -- Owners are admins (all permissions)
  IF v_role IS NULL THEN
    RETURN '["*"]'::jsonb;
  END IF;
  
  -- If seller, give default seller permissions
  IF v_role = 'seller' THEN
    RETURN '["/sales", "/products", "/customers", "/"]'::jsonb;
  END IF;
  
  -- If accountant, give default accountant permissions
  IF v_role = 'accountant' THEN
    RETURN '["/reports", "/finance", "/expenses", "/inventory", "/products", "/customers", "/suppliers", "/"]'::jsonb;
  END IF;
  
  -- If custom, return custom permissions + always allow /
  IF v_role = 'custom' THEN
    RETURN (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(v_perms || '["/"]'::jsonb) t(x));
  END IF;

  RETURN '[]'::jsonb;
END;
$$;
