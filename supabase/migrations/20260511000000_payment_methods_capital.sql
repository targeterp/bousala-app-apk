CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID DEFAULT auth.uid(),
    name TEXT NOT NULL,
    method_id TEXT NOT NULL, -- e.g., 'cash', 'bankily', 'custom_123'
    type TEXT DEFAULT 'bank', -- 'cash', 'bank', 'mobile_money'
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, method_id)
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's payment methods"
    ON payment_methods FOR SELECT
    USING (tenant_id = (SELECT get_current_tenant_id()));

CREATE POLICY "Users can insert their tenant's payment methods"
    ON payment_methods FOR INSERT
    WITH CHECK (tenant_id = (SELECT get_current_tenant_id()));

CREATE POLICY "Users can edit their tenant's payment methods"
    ON payment_methods FOR UPDATE
    USING (tenant_id = (SELECT get_current_tenant_id()));
    
CREATE POLICY "Users can delete their tenant's payment methods"
    ON payment_methods FOR DELETE
    USING (tenant_id = (SELECT get_current_tenant_id()));

-- Insert default methods for all existing tenants safely
INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default)
SELECT id, 'نقدي (كاش)', 'cash', 'cash', true
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default)
SELECT id, 'بنكيلي (Bankily)', 'bankily', 'mobile_money', false
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default)
SELECT id, 'مصرفي (Masrvi)', 'masrvi', 'mobile_money', false
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

INSERT INTO payment_methods (tenant_id, name, method_id, type, is_default)
SELECT id, 'سداد (Sedad)', 'sedad', 'mobile_money', false
FROM profiles
ON CONFLICT (tenant_id, method_id) DO NOTHING;

-- Capital Injection Function
CREATE OR REPLACE FUNCTION inject_capital(
    p_amount DECIMAL,
    p_payment_method TEXT,
    p_notes TEXT,
    p_tenant_id UUID,
    p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO transactions (
        tenant_id, 
        created_by, 
        type, 
        amount, 
        reference_type, 
        reference_id, 
        description, 
        date, 
        payment_method, 
        entity_type
    )
    VALUES (
        p_tenant_id, 
        p_user_id, 
        'income', 
        p_amount, 
        'capital', 
        p_user_id, -- Use user ID as reference just to avoid null
        COALESCE(p_notes, 'إيداع رأس مال / سيولة'), 
        CURRENT_DATE, 
        p_payment_method, 
        'general'
    );
END;
$$;
