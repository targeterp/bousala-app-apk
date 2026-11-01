-- Allow public read access to profiles so customers can view the storefront
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

-- Allow public read access to published products so customers can view them
CREATE POLICY "Published products are viewable by everyone" ON products FOR SELECT USING (is_published = true);
