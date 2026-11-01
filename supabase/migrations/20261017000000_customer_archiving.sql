-- Migration: Customer Archiving (Soft Delete / Deactivation)
-- Purpose: Allow archiving customers so they are hidden from sales, vouchers, and production orders
-- without losing their financial history or foreign keys.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Create an index to quickly filter active customers per tenant
CREATE INDEX IF NOT EXISTS idx_customers_active_tenant ON customers(tenant_id, is_active);
