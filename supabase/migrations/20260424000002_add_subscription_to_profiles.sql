-- Add subscription columns if they are missing
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Notify pgrst to reload schema cache
NOTIFY pgrst, 'reload schema';
