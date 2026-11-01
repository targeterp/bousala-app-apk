-- =========================================================================
-- ACCOUNT CLEANUP SCRIPT (CLEARS DUMMY DATA FOR SPECIFIC TENANT)
-- Target Tenant ID: dfbc3fd1-30f2-454a-a870-fe4e778a6e26
-- Target Email: 27090759@target-app.mr
-- =========================================================================
-- WARNING: This will permanently delete all records (sales, products, etc.)
-- for this specific account ONLY, excluding default categories.
-- Execute this directly in your Supabase SQL Editor.

BEGIN;

DO $$ 
DECLARE
  target_tenant UUID := 'dfbc3fd1-30f2-454a-a870-fe4e778a6e26';
BEGIN

  -- 1. Temporarily disable foreign key triggers to guarantee clean cascade
  SET CONSTRAINTS ALL DEFERRED;

  -- 2. Delete Dependent Items (Order Matters)
  DELETE FROM sale_items WHERE tenant_id = target_tenant;
  DELETE FROM custom_order_items WHERE tenant_id = target_tenant;
  DELETE FROM purchase_items WHERE tenant_id = target_tenant;
  DELETE FROM tailor_payments WHERE tenant_id = target_tenant;
  DELETE FROM supplier_payments WHERE tenant_id = target_tenant;

  -- 3. Delete Parent Transactions & Sales
  DELETE FROM sales WHERE tenant_id = target_tenant;
  DELETE FROM custom_orders WHERE tenant_id = target_tenant;
  DELETE FROM purchases WHERE tenant_id = target_tenant;
  
  -- 4. Delete Core Financials
  DELETE FROM transactions WHERE tenant_id = target_tenant;
  DELETE FROM expenses WHERE tenant_id = target_tenant;
  
  -- 5. Delete Core Entities (Products & Contacts)
  DELETE FROM products WHERE tenant_id = target_tenant;
  DELETE FROM customers WHERE tenant_id = target_tenant;
  DELETE FROM suppliers WHERE tenant_id = target_tenant;
  DELETE FROM tailors WHERE tenant_id = target_tenant;
  DELETE FROM employees WHERE tenant_id = target_tenant;

  -- "ما عدي التصنيفات الافتراضية" (Except default categories)
  -- We just leave the 'categories' and 'expense_categories' tables untouched.
  
  RAISE NOTICE 'Cleanup completed successfully for tenant: %', target_tenant;
  
END $$;

COMMIT;
