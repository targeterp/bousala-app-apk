import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useProductsData(tenantId: string | null) {
  return useQuery({
    queryKey: ['products', tenantId],
    queryFn: async () => {
      if (!tenantId) return { products: [], categories: [], suppliers: [] };

      const [productsRes, categoriesRes, suppliersRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, barcode, sell_price, purchase_price, stock_quantity, unit, category, category_id, is_published, supplier_id, image_url, images, created_at, tenant_id, suppliers(name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('categories')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name', { ascending: true }),
        supabase
          .from('suppliers')
          .select('id, name')
          .eq('tenant_id', tenantId)
      ]);

      const data = productsRes.data || [];
      const productIds = data.map((p: any) => p.id);
      
      let salesCountByProduct: Record<string, number> = {};
      let customOrdersUsageByProduct: Record<string, number> = {};
      
      if (productIds.length > 0) {
        const CHUNK_SIZE = 150;
        const chunks = [];
        for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
          chunks.push(productIds.slice(i, i + CHUNK_SIZE));
        }

        const saleItemsData: any[] = [];
        const customOrderItemsData: any[] = [];

        await Promise.all(chunks.map(async (chunk) => {
          const [saleItemsRes, customOrderItemsRes] = await Promise.all([
            supabase.from('sale_items').select('product_id, quantity').in('product_id', chunk),
            supabase.from('custom_order_items').select('product_id, fabric_meters').in('product_id', chunk)
          ]);
          
          if (!saleItemsRes.error && saleItemsRes.data) {
            saleItemsData.push(...saleItemsRes.data);
          }
          
          if (!customOrderItemsRes.error && customOrderItemsRes.data) {
            customOrderItemsData.push(...customOrderItemsRes.data);
          }
        }));
          
        salesCountByProduct = saleItemsData.reduce((acc, item) => {
          acc[item.product_id] = (acc[item.product_id] || 0) + (item.quantity || 0);
          return acc;
        }, {} as Record<string, number>);
        
        customOrdersUsageByProduct = customOrderItemsData.reduce((acc, item) => {
          acc[item.product_id] = (acc[item.product_id] || 0) + (Number(item.fabric_meters) || 0);
          return acc;
        }, {} as Record<string, number>);
      }

      const enhancedProducts = data.map((p: any) => ({
        ...p,
        sales: (salesCountByProduct[p.id] || 0) + (customOrdersUsageByProduct[p.id] || 0),
        images: p.images || (p.image_url ? [p.image_url] : [])
      }));

      return {
        products: enhancedProducts,
        categories: categoriesRes.data || [],
        suppliers: suppliersRes.data || []
      };
    },
    enabled: !!tenantId,
    staleTime: 0,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
