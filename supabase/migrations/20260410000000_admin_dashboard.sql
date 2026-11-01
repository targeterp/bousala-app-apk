CREATE OR REPLACE FUNCTION get_admin_users_stats()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  subscription_plan TEXT,
  subscription_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  products_count BIGINT,
  sales_count BIGINT
) AS $$
BEGIN
  -- Check if the caller is the admin
  IF auth.jwt() ->> 'email' != 'infogrp.target@gmail.com' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    u.email::TEXT,
    u.phone::TEXT,
    p.subscription_plan,
    p.subscription_end_date,
    p.created_at,
    u.last_sign_in_at,
    (SELECT COUNT(*) FROM products pr WHERE pr.tenant_id = p.id) as products_count,
    (SELECT COUNT(*) FROM sales s WHERE s.tenant_id = p.id) as sales_count
  FROM profiles p
  JOIN auth.users u ON p.id = u.id
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
