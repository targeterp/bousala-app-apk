-- Add opening_balance to customers and suppliers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(12, 2) DEFAULT 0;

-- Add payment_method and entity tracking to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entity_type TEXT; -- 'customer', 'supplier', 'employee', 'partner', 'general'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Create partners table
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  share_percentage DECIMAL(5, 2) DEFAULT 0,
  tenant_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON partners FOR ALL USING (tenant_id = auth.uid());
