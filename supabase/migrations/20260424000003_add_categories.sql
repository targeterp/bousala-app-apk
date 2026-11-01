-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tenant_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Note: Policies such as "Tenant Isolation" or "Allow all for authenticated" 
-- should ideally be managed, but for consistency we use "Tenant Isolation RBAC" if defined,
-- or fallback to a general authenticated insert for now if we didn't specify.

CREATE POLICY "Tenant Isolation RBAC" ON categories FOR ALL 
USING (tenant_id = public.get_current_tenant_id());

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
