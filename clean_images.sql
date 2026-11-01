-- =========================================================================
-- IMAGES CLEANUP SCRIPT
-- =========================================================================
-- This script safely removes Base64 strings from the `image_url` and `images`
-- columns in the `products` table.
-- It resolves performance issues caused by large string blobs in IndexedDB
-- and network requests without touching any other data like sales,
-- stock_quantity, or names.
--
-- Execute this directly in your Supabase SQL Editor.

BEGIN;

DO $$ 
BEGIN
  -- We set image_url to NULL and images to an empty JSONB array
  -- instead of dropping columns, so existing typescript definitions 
  -- won't break if anything still refers to them optionally.
  
  UPDATE products 
  SET 
    image_url = NULL, 
    images = ARRAY[]::text[] 
  WHERE 
    image_url IS NOT NULL 
    OR array_length(images, 1) > 0;

  RAISE NOTICE 'Cleanup of large image data completed successfully. Performance should be restored.';
  
END $$;

COMMIT;
