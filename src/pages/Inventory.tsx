import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Search, Plus, ArrowRightLeft, 
  Settings2, Loader2, AlertCircle, RotateCw, 
  ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useSettings } from '../contexts/SettingsContext';
import { toast } from 'react-hot-toast';
import { cn } from '../utils';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { ProductMovementModal } from '../components/ProductMovementModal';

type Product = {
  id: string;
  name: string;
  stock_quantity: number;
  unit: string;
  purchase_price?: number;
  sell_price?: number;
  category?: string;
  created_at?: string;
};

export function Inventory() {
  const { tenantId } = useTenant();
  const { settings } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Clean Filters as shown in image
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'qty_asc' | 'qty_desc'>('name');

  // Movement Modal
  const [selectedProductForMovement, setSelectedProductForMovement] = useState<Product | null>(null);

  // Split and Adjust Modals
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [splitForm, setSplitForm] = useState({
    source_product_id: '',
    target_product_id: '',
    source_qty: '',
    target_qty: ''
  });

  const [adjustForm, setAdjustForm] = useState({
    product_id: '',
    quantity_change: '',
    note: ''
  });

  useEffect(() => {
    fetchProducts();
  }, [tenantId]);

  const fetchProducts = async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock_quantity, unit, purchase_price, sell_price, category, created_at')
        .eq('tenant_id', tenantId)
        .order('name');
        
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('حدث خطأ أثناء جلب المنتجات');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSplitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    
    const sourceProduct = products.find(p => p.id === splitForm.source_product_id);
    const sourceQty = parseFloat(splitForm.source_qty);
    
    if (!sourceProduct || sourceProduct.stock_quantity < sourceQty) {
      toast.error('الكمية المتوفرة غير كافية لعملية الفك');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('split_product', {
        p_source_product_id: splitForm.source_product_id,
        p_target_product_id: splitForm.target_product_id,
        p_source_qty: sourceQty,
        p_target_qty: parseFloat(splitForm.target_qty),
        p_tenant_id: tenantId,
        p_user_id: user?.id
      });

      if (error) throw error;
      toast.success('تمت عملية الفك والتجزئة بنجاح');
      setIsSplitModalOpen(false);
      setSplitForm({ source_product_id: '', target_product_id: '', source_qty: '', target_qty: '' });
      fetchProducts();
    } catch (error: any) {
      console.error('Error splitting product:', error);
      toast.error(error.message || 'حدث خطأ أثناء عملية الفك');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('adjust_stock', {
        p_product_id: adjustForm.product_id,
        p_quantity_change: parseFloat(adjustForm.quantity_change),
        p_note: adjustForm.note,
        p_tenant_id: tenantId,
        p_user_id: user?.id
      });

      if (error) throw error;
      toast.success('تمت تسوية الجرد بنجاح');
      setIsAdjustModalOpen(false);
      setAdjustForm({ product_id: '', quantity_change: '', note: '' });
      fetchProducts();
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      toast.error(error.message || 'حدث خطأ أثناء تسوية الجرد');
    } finally {
      setIsSaving(false);
    }
  };

  // Metrics matching exact 3 cards in user image
  const metrics = useMemo(() => {
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach(p => {
      const stock = Number(p.stock_quantity || 0);
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= 5) {
        lowStockCount++;
      }
    });

    return {
      totalProducts: products.length,
      lowStockCount,
      outOfStockCount
    };
  }, [products]);

  // Filtered and Sorted Products
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        const stock = Number(p.stock_quantity || 0);
        if (stockFilter === 'available') return stock > 5;
        if (stockFilter === 'low') return stock > 0 && stock <= 5;
        if (stockFilter === 'out') return stock <= 0;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'qty_asc') return (a.stock_quantity || 0) - (b.stock_quantity || 0);
        if (sortBy === 'qty_desc') return (b.stock_quantity || 0) - (a.stock_quantity || 0);
        return a.name.localeCompare(b.name, 'ar');
      });
  }, [products, searchQuery, stockFilter, sortBy]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      
      {/* Header matching user image */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-[#00A372] flex items-center justify-center shrink-0">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">
              إدارة المخزون
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium mt-0.5">
              تسوية الكميات وتجزئة الأصناف
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsSplitModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#00A372] hover:bg-[#008f64] text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>فك وتجزئة صنف</span>
          </button>
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <Settings2 className="w-4 h-4" />
            <span>تسوية جرد يدوية</span>
          </button>
        </div>
      </div>

      {/* 3 Overview Cards matching exact image mockup (RTL: Total, Low, Out) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Card 1: Total Products (Right in RTL) */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">
              إجمالي الأصناف
            </span>
            <div className="text-3xl font-black text-gray-900 dark:text-white">
              {metrics.totalProducts}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Low Stock (5 or less) */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">
              أوشكت على النفاذ (5 وأقل)
            </span>
            <div className="text-3xl font-black text-gray-900 dark:text-white">
              {metrics.lowStockCount}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-500 dark:text-orange-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Out of stock (Left in RTL) */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">
              أصناف نافدة
            </span>
            <div className="text-3xl font-black text-red-600 dark:text-red-400">
              {metrics.outOfStockCount}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Main Container with Search, Filters, and Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
        
        {/* Search, Filter Tabs and Sort - Matching Image */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Search Input (Right side) */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="ابحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-11 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#00A372]/40 text-gray-900 dark:text-white text-sm outline-none transition-all placeholder:text-gray-400"
            />
            <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3">
            {/* Filter Tabs matching image: الكل, متوفر, منخفض, نافد */}
            <div className="inline-flex p-1 bg-gray-100/80 dark:bg-gray-800 rounded-xl text-xs font-bold">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'available', label: 'متوفر' },
                { id: 'low', label: 'منخفض' },
                { id: 'out', label: 'نافد' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStockFilter(tab.id as any)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg transition-all",
                    stockFilter === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-black"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold py-2 pl-8 pr-3 rounded-xl outline-none cursor-pointer focus:ring-1 focus:ring-[#00A372]"
              >
                <option value="name">الترتيب حسب الاسم</option>
                <option value="qty_asc">الكمية: من الأقل للأعلى</option>
                <option value="qty_desc">الكمية: من الأعلى للأقل</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

        </div>

        {/* Inventory Items Table */}
        <div className="overflow-x-auto min-h-[380px]">
          <table className="w-full text-right">
            <thead className="bg-gray-50/50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-400 text-xs border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-3.5 font-bold">اسم المنتج / الصنف</th>
                <th className="px-6 py-3.5 font-bold text-left">الرصيد المتوفر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-16 text-center text-gray-400">
                    <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#00A372] mb-2" />
                    <p className="text-xs">جارِ تحميل الأصناف...</p>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-16 text-center text-gray-400 text-sm">
                    لا توجد منتجات مطابقة للبحث أو التصفية
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = Number(product.stock_quantity || 0);
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 5;

                  return (
                    <tr 
                      key={product.id} 
                      className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Product Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-gray-900 dark:text-white text-sm">
                            {product.name}
                          </span>
                          {isOutOfStock && (
                            <span className="text-red-500 font-bold text-[11px] bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-100 dark:border-red-900/50">
                              نافد
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stock Quantity Badge & Movement Action Button */}
                      <td className="px-6 py-4 text-left">
                        <div className="flex items-center justify-end gap-3">
                          
                          {/* حركة الصنف Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedProductForMovement(product)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-all shadow-xs group"
                            title="عرض كشف حركة وتوريد ومبيعات الصنف"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-emerald-600 group-hover:rotate-180 transition-transform duration-300" />
                            <span>حركة الصنف</span>
                          </button>

                          {/* Quantity Pill matching user screenshot */}
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border",
                            isOutOfStock
                              ? "text-red-600 bg-red-50/80 border-red-200 dark:bg-red-950/30 dark:border-red-900/40"
                              : isLowStock
                              ? "text-amber-600 bg-amber-50/80 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40"
                              : "text-emerald-600 bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/40"
                          )}>
                            {isLowStock && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <span>{stock}</span>
                            <span className="opacity-40 font-normal">|</span>
                            <span>{product.unit || 'قطعة'}</span>
                          </div>

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Split Product Modal */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-6 h-6 text-[#00A372]" />
                فك وتجزئة صنف
              </h2>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSplitProduct} className="p-6 overflow-y-auto">
              <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-xl mb-6 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>
                  عملية الفك والتجزئة تسمح لك بتحويل كمية من صنف معين (مثل كرتون) إلى صنف آخر (مثل قطع مفردة). سيتم خصم الكمية من الصنف المصدر وإضافتها للصنف الهدف.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                {/* Source Product */}
                <div className="space-y-4 p-4 border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-2xl relative z-10">
                  <h3 className="font-bold text-red-600 dark:text-red-400 text-sm">
                     الصنف المُراد فكه (يُخصم منه)
                  </h3>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">اختر الصنف</label>
                    <SearchableSelect
                      required
                      value={splitForm.source_product_id}
                      onChange={val => setSplitForm({...splitForm, source_product_id: val})}
                      options={products.filter(p => p.stock_quantity > 0).map(p => ({ value: p.id, label: p.name, subtitle: `المتوفر: ${p.stock_quantity}` }))}
                      placeholder="ابحث عن صنف..."
                      className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">الكمية المراد فكها</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={splitForm.source_qty}
                      onChange={e => setSplitForm({...splitForm, source_qty: e.target.value})}
                      className="w-full px-4 py-3 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                      placeholder="مثال: 1"
                    />
                  </div>
                </div>

                {/* Target Product */}
                <div className="space-y-4 p-4 border border-green-100 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10 rounded-2xl relative z-10">
                  <h3 className="font-bold text-green-600 dark:text-green-400 text-sm">
                     الصنف الناتج (يُضاف إليه)
                  </h3>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">اختر الصنف</label>
                    <SearchableSelect
                      required
                      value={splitForm.target_product_id}
                      onChange={val => setSplitForm({...splitForm, target_product_id: val})}
                      options={products.map(p => ({ value: p.id, label: p.name }))}
                      placeholder="ابحث عن صنف..."
                      className="bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">الكمية الناتجة</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="any"
                      value={splitForm.target_qty}
                      onChange={e => setSplitForm({...splitForm, target_qty: e.target.value})}
                      className="w-full px-4 py-3 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="مثال: 12"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-[#00A372] text-white py-3.5 rounded-xl font-bold hover:bg-[#008f64] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
                  تأكيد العملية
                </button>
                <button
                  type="button"
                  onClick={() => setIsSplitModalOpen(false)}
                  className="px-6 py-3.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-6 h-6 text-[#00A372]" />
                تسوية جرد يدوية
              </h2>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleAdjustStock} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الصنف</label>
                <SearchableSelect
                  required
                  value={adjustForm.product_id}
                  onChange={val => setAdjustForm({...adjustForm, product_id: val})}
                  options={products.map(p => ({ value: p.id, label: p.name, subtitle: `المتوفر: ${p.stock_quantity}` }))}
                  placeholder="ابحث عن صنف..."
                  className="bg-gray-50 dark:bg-gray-800"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">مقدار التسوية (بالموجب للإضافة، بالسالب للخصم)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={adjustForm.quantity_change}
                  onChange={e => setAdjustForm({...adjustForm, quantity_change: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#00A372] outline-none"
                  placeholder="مثال: 5 أو -2"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">سبب التسوية / ملاحظات</label>
                <input
                  type="text"
                  required
                  value={adjustForm.note}
                  onChange={e => setAdjustForm({...adjustForm, note: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#00A372] outline-none"
                  placeholder="مثال: بضاعة تالفة، هدر، تسوية جرد..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-[#00A372] text-white py-3.5 rounded-xl font-bold hover:bg-[#008f64] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التسوية'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-6 py-3.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product Movement Modal */}
      {selectedProductForMovement && (
        <ProductMovementModal
          product={selectedProductForMovement}
          onClose={() => setSelectedProductForMovement(null)}
        />
      )}

    </div>
  );
}
