CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
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

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
