CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES profiles(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  plan_type TEXT NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES profiles(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet (
  tenant_id UUID PRIMARY KEY REFERENCES profiles(id),
  balance NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facebook_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES profiles(id),
  objective TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  budget NUMERIC NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_ads ENABLE ROW LEVEL SECURITY;

-- Policies for wallet
CREATE POLICY "Users can manage their own wallet"
  ON wallet
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid());

-- Policies for facebook_ads
CREATE POLICY "Users can manage their own ads"
  ON facebook_ads
  FOR ALL
  TO authenticated
  USING (tenant_id = auth.uid());

CREATE POLICY "Admins can view and update all ads"
  ON facebook_ads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR auth.jwt() ->> 'email' = 'infogrp.target@gmail.com' OR auth.jwt() ->> 'email' LIKE '47071347%')
    )
  );

-- Policies for vouchers
CREATE POLICY "Admins can manage vouchers"
  ON vouchers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR auth.jwt() ->> 'email' = 'infogrp.target@gmail.com' OR auth.jwt() ->> 'email' LIKE '47071347%')
    )
  );

CREATE POLICY "Anyone can read unused vouchers"
  ON vouchers
  FOR SELECT
  TO authenticated
  USING (is_used = false);

-- Policies for subscription_vouchers
CREATE POLICY "Admins can manage subscription_vouchers"
  ON subscription_vouchers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR auth.jwt() ->> 'email' = 'infogrp.target@gmail.com' OR auth.jwt() ->> 'email' LIKE '47071347%')
    )
  );

CREATE POLICY "Anyone can read unused subscription_vouchers"
  ON subscription_vouchers
  FOR SELECT
  TO authenticated
  USING (is_used = false);

-- RPC for redeeming subscription voucher
CREATE OR REPLACE FUNCTION redeem_subscription_voucher(p_voucher_code TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_voucher RECORD;
  v_days INTEGER;
  v_current_end_date TIMESTAMPTZ;
  v_new_end_date TIMESTAMPTZ;
BEGIN
  -- Find the voucher
  SELECT * INTO v_voucher
  FROM subscription_vouchers
  WHERE code = p_voucher_code AND is_used = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'رمز القسيمة غير صحيح أو مستخدم مسبقاً');
  END IF;

  -- Determine days to add
  IF v_voucher.plan_type = 'monthly' THEN
    v_days := 30;
  ELSIF v_voucher.plan_type = 'annual' THEN
    v_days := 365;
  ELSE
    v_days := 30; -- Default
  END IF;

  -- Get current subscription end date
  SELECT subscription_end_date INTO v_current_end_date
  FROM profiles
  WHERE id = auth.uid();

  -- Calculate new end date
  IF v_current_end_date IS NULL OR v_current_end_date < NOW() THEN
    v_new_end_date := NOW() + (v_days || ' days')::INTERVAL;
  ELSE
    v_new_end_date := v_current_end_date + (v_days || ' days')::INTERVAL;
  END IF;

  -- Update profile
  UPDATE profiles
  SET subscription_end_date = v_new_end_date,
      subscription_plan = v_voucher.plan_type
  WHERE id = auth.uid();

  -- Mark voucher as used
  UPDATE subscription_vouchers
  SET is_used = true,
      used_by = auth.uid(),
      used_at = NOW()
  WHERE id = v_voucher.id;

  RETURN json_build_object('success', true, 'message', 'تم تفعيل الاشتراك بنجاح');
END;
$$;
