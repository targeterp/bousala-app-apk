-- Create a new storage bucket for product images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for product-images bucket

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

-- Allow public read access to product images
CREATE POLICY "product_images_public_read" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload images
CREATE POLICY "product_images_insert" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their own uploads (optional/per tenant if path structured correctly)
CREATE POLICY "product_images_update" 
ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete their images
CREATE POLICY "product_images_delete" 
ON storage.objects FOR DELETE 
USING (
    bucket_id = 'product-images' 
    AND auth.role() = 'authenticated'
);
