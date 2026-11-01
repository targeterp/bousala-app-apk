-- Drop the existing constraint
ALTER TABLE public.store_user_access 
DROP CONSTRAINT IF EXISTS store_user_access_access_role_check;

-- Add the new constraint allowing 'custom'
ALTER TABLE public.store_user_access 
ADD CONSTRAINT store_user_access_access_role_check 
CHECK (access_role IN ('admin', 'manager', 'seller', 'accountant', 'custom'));
