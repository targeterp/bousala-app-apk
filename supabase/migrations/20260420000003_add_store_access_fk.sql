-- =========================================================================
-- Step 3: Add Foreign Key for Profiles Join
-- =========================================================================

-- We need this so that PostgREST can natively join `store_user_access` with `profiles`
-- when we do `.select('..., profiles(full_name)')`

ALTER TABLE public.store_user_access 
ADD CONSTRAINT fk_store_user_profile 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;
