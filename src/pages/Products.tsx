import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Plus, Search, Filter, Megaphone, Settings, 
  Share2, X, Image as ImageIcon, Loader2, Edit3, Save, Trash2, Upload,
  AlertCircle, Link as LinkIcon, Camera, Wand2, Lock,
  TrendingDown, DollarSign, Eye, EyeOff, FileText, Printer, Download, ClipboardList, PieChart as PieChartIcon, 
  EyeOff as EyeOffIcon
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { cn } from '../utils';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { useSettings } from '../contexts/SettingsContext';
import { useSubscription } from '../components/SubscriptionGuard';
import { useTenant } from '../contexts/TenantContext';
import { useProductsData } from '../hooks/useProductsData';
import { useQueryClient } from '@tanstack/react-query';
import { generateInvoicePDF, printInvoice } from '../utils/pdfGenerator';

// Extended Product Type for UI
type Product = {
  id: string;
  name: string;
  barcode?: string;
  sell_price: number;
  purchase_price?: number;
  stock_quantity: number;
  unit?: string;
  category: string;
  category_id?: string;
  image_url: string;
  images?: string[];
  sales?: number;
  is_published?: boolean;
  supplier_id?: string;
};

type Category = {
  id: string;
  name: string;
  type: 'general' | 'fabric' | 'finished_good';
  color?: string;
};

export function Products() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { isExpired, setShowRenewModal } = useSubscription();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data, isLoading } = useProductsData(tenantId);
  const products = data?.products || [];
  const suppliers = data?.suppliers || [];
  const categories = data?.categories || [];
  const userId = tenantId;
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<'admin'|'seller'|'accountant'>('admin');
  const [storeSlug, setStoreSlug] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStoreSlug(data.session?.user.user_metadata?.storeSlug || null);
    });
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data as any);
      }
    });
  }, []);
  const [isStockValueVisible, setIsStockValueVisible] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isExportingStock, setIsExportingStock] = useState<false | 'pdf' | 'print'>(false);

  const [error, setError] = useState<string | null>(null);

  const stats = React.useMemo(() => ({
    total: products.length,
    lowStock: products.filter(p => Number(p.stock_quantity) <= 5).length,
    outOfStock: products.filter(p => Number(p.stock_quantity) <= 0).length,
    totalValue: products.reduce((acc, p) => acc + ((Number(p.purchase_price) || 0) * (Number(p.stock_quantity) || 0)), 0)
  }), [products]);

  const filteredProducts = React.useMemo(() => {
    const s = searchQuery.toLowerCase();
    return products.filter(p => 
      (p.name?.toLowerCase() || '').includes(s) || 
      (p.barcode || '').includes(s) ||
      (p.categories?.name?.toLowerCase() || '').includes(s)
    );
  }, [products, searchQuery]);

  const openManageModal = (product: any) => {
    setSelectedProduct(product);
    setIsEditing(false);
    setEditForm({
      name: product.name,
      barcode: product.barcode || '',
      sell_price: product.sell_price,
      purchase_price: product.purchase_price || 0,
      stock_quantity: product.stock_quantity,
      unit: product.unit || 'قطعة',
      category: product.categories?.name || '',
      category_id: product.category_id || '',
      images: product.images || (product.image_url ? [product.image_url] : []),
      is_published: product.is_published ?? true,
      supplier_id: product.supplier_id || ''
    });
  };

  const closeManageModal = () => {
    setSelectedProduct(null);
    setIsEditing(false);
  };

  const handleUpdateProduct = (e: any) => {
    e.preventDefault();
    if (isSaving) return;
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }

    if (!selectedProduct) return;
    setIsSaving(true);
    const savedEditing = { ...editForm, id: selectedProduct.id };
    
    // Optimistic UI updates
    setSelectedProduct(prev => prev ? { ...prev, ...savedEditing } as any : null);
    setIsEditing(false);

    const promise = (async () => {
      try {
        let payload: any = {
          name: savedEditing.name,
          barcode: savedEditing.barcode || null,
          sell_price: Number(savedEditing.sell_price) || 0,
          purchase_price: Number(savedEditing.purchase_price) || 0,
          stock_quantity: Number(savedEditing.stock_quantity) || 0,
          unit: savedEditing.unit,
          category_id: savedEditing.category_id || null,
          supplier_id: savedEditing.supplier_id || null,
          is_published: savedEditing.is_published,
          image_url: savedEditing.images?.[0] || null,
          images: savedEditing.images || []
        };

        const { error } = await supabase.from('products').update(payload).eq('id', savedEditing.id);
        if (error) {
           let fallbackPayload = { ...payload };
           if (error.message?.includes('image_url') || error.code === '42703') delete fallbackPayload.image_url;
           if (error.message?.includes('images') || error.code === '42703') delete fallbackPayload.images;
           const { error: retryError } = await supabase.from('products').update(fallbackPayload).eq('id', savedEditing.id);
           if (retryError) throw retryError;
        }
      } finally {
        setIsSaving(false);
      }
    })();

    toast.promise(promise, {
      loading: 'جاري حفظ التغييرات...',
      success: () => {
        queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
        return 'تم التعديل بنجاح';
      },
      error: 'حدث خطأ أثناء تعديل المنتج'
    });
  };

  const handleImageUpload = (e: any, isAdd: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('عذراً، حجم الصورة كبير جداً (الحد الأقصى 10 ميجابايت)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            
            try {
              setIsSaving(true);
              const fileExt = 'webp';
              const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
              const filePath = `${tenantId}/${fileName}`;
              
              const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(filePath, blob, {
                  contentType: 'image/webp'
                });
                
              if (uploadError) throw uploadError;
              
              const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(filePath);
                
              if (isAdd) {
                setAddForm(prev => ({ ...prev, images: [publicUrl] }));
              } else {
                setEditForm(prev => ({ ...prev, images: [publicUrl] }));
              }
            } catch (err) {
              console.error('Upload error:', err);
              setError('فشل في رفع الصورة، يرجى المحاولة مرة أخرى.');
            } finally {
              setIsSaving(false);
            }
          }, 'image/webp', 0.8);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number, isAdd: boolean) => {
    if (isAdd) {
      setAddForm(prev => ({ ...prev, images: [] }));
    } else {
      setEditForm(prev => ({ ...prev, images: [] }));
    }
  };

  
  // Modal States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', barcode: '', sell_price: 0 as number | '', purchase_price: 0 as number | '', stock_quantity: 0 as number | '', unit: 'قطعة', category: '', category_id: '', images: [] as string[], is_published: true, supplier_id: '' });
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', barcode: '', sell_price: '' as number | '', purchase_price: '' as number | '', stock_quantity: '' as number | '', unit: 'قطعة', category: '', category_id: '', images: [] as string[], is_published: true, supplier_id: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Category Management Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', type: 'general' as const });
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  
  // Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'add' | 'edit' | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only listen if a modal is open
      if (!isAddModalOpen && !selectedProduct) return;
      
      const currentTime = Date.now();
      
      // If the target is an input, we only care if it's a very fast sequence (external scanner)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (currentTime - lastKeyTime.current > 50) {
          // Normal typing speed, don't capture for scanner buffer
          lastKeyTime.current = currentTime;
          return;
        }
      }
      
      // External scanners usually send keys very fast (< 50ms)
      if (currentTime - lastKeyTime.current > 50) {
        scannerBuffer.current = '';
      }
      
      if (e.key === 'Enter') {
        if (scannerBuffer.current.length > 3) {
          const code = scannerBuffer.current;
          if (isAddModalOpen) {
            setAddForm(prev => ({ ...prev, barcode: code }));
          } else if (selectedProduct && isEditing) {
            setEditForm(prev => ({ ...prev, barcode: code }));
          }
          scannerBuffer.current = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        scannerBuffer.current += e.key;
      }
      
      lastKeyTime.current = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, selectedProduct, isEditing]);

  useEffect(() => {
    const startScanner = async () => {
      if (isScannerOpen) {
        try {
          const html5QrCode = new Html5Qrcode("product-barcode-reader");
          html5QrCodeRef.current = html5QrCode;
          
          const config = { fps: 10, qrbox: { width: 250, height: 150 } };
          
          await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText) => {
              if (scannerTarget === 'add') {
                setAddForm(prev => ({ ...prev, barcode: decodedText }));
              } else if (scannerTarget === 'edit') {
                setEditForm(prev => ({ ...prev, barcode: decodedText }));
              }
              stopScanner();
            },
            undefined
          );
        } catch (err) {
          console.error("Failed to start scanner:", err);
        }
      }
    };

    const stopScanner = async () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current = null;
          setIsScannerOpen(false);
        } catch (err) {
          console.error("Failed to stop scanner:", err);
        }
      } else {
        setIsScannerOpen(false);
      }
    };

    if (isScannerOpen) {
      startScanner();
    }

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [isScannerOpen, scannerTarget]);

  const generateBarcode = (type: 'add' | 'edit') => {
    const code = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
    if (type === 'add') {
      setAddForm(prev => ({ ...prev, barcode: code }));
    } else {
      setEditForm(prev => ({ ...prev, barcode: code }));
    }
  };
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }

    if (!addForm.name || !addForm.sell_price) {
      setError('يرجى إدخال اسم المنتج وسعر البيع');
      return;
    }

    setIsSaving(true);
    const savedForm = { ...addForm };

    const promise = (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found');

        let payload: any = {
          tenant_id: tenantId,
          name: savedForm.name,
          barcode: savedForm.barcode || null,
          sell_price: Number(savedForm.sell_price) || 0,
          purchase_price: Number(savedForm.purchase_price) || 0,
          stock_quantity: Number(savedForm.stock_quantity) || 0,
          unit: savedForm.unit,
          category_id: savedForm.category_id || null,
          supplier_id: savedForm.supplier_id || null,
          is_published: savedForm.is_published,
          image_url: savedForm.images?.[0] || null,
          images: savedForm.images || []
        };

        const { error } = await supabase.from('products').insert([payload]);
        if (error) {
           let fallbackPayload = { ...payload };
           if (error.message?.includes('image_url') || error.code === '42703') delete fallbackPayload.image_url;
           if (error.message?.includes('images') || error.code === '42703') delete fallbackPayload.images;
           const { error: retryError } = await supabase.from('products').insert([fallbackPayload]);
           if (retryError) throw retryError;
        }

        // On success, close modal and clear form
        setIsAddModalOpen(false);
        setAddForm({ name: '', barcode: '', sell_price: '', purchase_price: '', stock_quantity: '', unit: 'قطعة', category: '', category_id: '', images: [], is_published: true, supplier_id: '' });
      } finally {
        setIsSaving(false);
      }
    })();

    toast.promise(promise, {
      loading: 'جاري إضافة المنتج...',
      success: () => {
        queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
        return 'تم إضافة المنتج بنجاح';
      },
      error: 'حدث خطأ أثناء إضافة المنتج'
    });
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!userId) return;
    setIsSavingCategory(true);
    try {
      const { data, error } = await supabase.from('categories').insert([{
        tenant_id: userId,
        name: newCategory.name,
        type: newCategory.type
      }]).select().single();

      if (error) throw error;
      setNewCategory({ name: '', type: 'general' });
      // update state if inserting from new product modal
      if (data) {
        setAddForm(prev => ({ ...prev, category_id: data.id, category: data.name }));
        setEditForm(prev => ({ ...prev, category_id: data.id, category: data.name }));
      }
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
      setIsCategoryModalOpen(false); // Close the category modal after successful add
    } catch (error: any) {
      toast.error('خطأ في إضافة التصنيف: ' + error.message);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const inventoryDetails = React.useMemo(() => {
    let totalCapital = 0;
    let expectedValue = 0;
    let totalPieces = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const catStats: Record<string, { pieces: number, capital: number }> = {};

    products.forEach(p => {
       const qty = Number(p.stock_quantity) || 0;
       const cost = Number(p.purchase_price) || 0;
       const sell = Number(p.sell_price) || 0;
       const cat = p.category || 'بدون تصنيف';

       const capital = qty * cost;
       const expected = qty * sell;

       totalCapital += capital;
       expectedValue += expected;
       totalPieces += qty;

       if (qty <= 0) outOfStockCount++;
       else if (qty <= 5) lowStockCount++;

       if (!catStats[cat]) catStats[cat] = { pieces: 0, capital: 0 };
       catStats[cat].pieces += qty;
       catStats[cat].capital += capital;
    });

    return {
       totalCapital,
       expectedValue,
       totalPieces,
       lowStockCount,
       outOfStockCount,
       catStats
    };
  }, [products]);

  const handleExportStockage = async (type: 'pdf' | 'print') => {
    setIsExportingStock(type);
    try {
      const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      
      let totalPieces = 0;
      let totalExpectedValue = 0;
      
      const items = products.map(p => {
          const qty = Number(p.stock_quantity) || 0;
          const sell = Number(p.sell_price) || 0;
          totalPieces += qty;
          totalExpectedValue += (qty * sell);
          
          return {
              name: p.name,
              quantity: qty,
              category: p.category || 'بدون تصنيف',
              price: sell,
              total: qty * sell
          };
      });

      const summary = {
          totalProducts: products.length,
          totalPieces,
          totalValue: totalExpectedValue,
          currency: settings.currency || 'د.ج'
      };

      const reportData = {
          type: 'inventory' as const,
          id: `INV-${Date.now()}`,
          date: today,
          items,
          summary
      };

      if (type === 'pdf') {
          await generateInvoicePDF(settings, reportData, `تقرير_جرد_المخزون_${new Date().toISOString().split('T')[0]}`);
      } else {
          await printInvoice(settings, reportData);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تصدير التقرير');
    } finally {
      setIsExportingStock(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error.message || 'حدث خطأ أثناء حذف المنتج');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    // Check if products are linked
    const linkedProducts = products.filter(p => p.category_id === id);
    if (linkedProducts.length > 0) {
      toast.error(`لا يمكن حذف هذا التصنيف لأنه مرتبط بـ ${linkedProducts.length} منتجات. يرجى تغيير تصنيف المنتجات أولاً.`);
      return;
    }

    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;

    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] });
    } catch (error: any) {
      toast.error('خطأ في حذف التصنيف: ' + error.message);
    }
  };

  const handleCopyLink = () => {
    if (!userId || !selectedProduct) return;
    const link = `${window.location.origin}/store/${storeSlug || userId}?product=${selectedProduct.id}`;
    navigator.clipboard.writeText(link).then(() => {
      toast.success('تم نسخ رابط المنتج بنجاح!');
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20" dir="rtl">
      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">إدارة التصنيفات</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 dark:bg-gray-800 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-6">
              <form onSubmit={handleAddCategory} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">اسم التصنيف</label>
                    <input 
                      type="text" required value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-brand-primary text-sm"
                      placeholder="مثلاً: أقمشة"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">نوع النظام</label>
                    <select 
                      value={newCategory.type} onChange={e => setNewCategory({...newCategory, type: e.target.value as any})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-brand-primary text-sm"
                    >
                      <option value="general">عام</option>
                      <option value="fabric">أقمشة (خام)</option>
                      <option value="finished_good">منتج نهائي</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={isSavingCategory} className="w-full bg-brand-primary text-white py-2 rounded-lg font-bold flex justify-center items-center gap-2 text-sm">
                  {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>إضافة تصنيف</span>
                </button>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                <label className="block text-xs font-bold text-gray-500 mb-2">التصنيفات الحالية</label>
                {categories.length === 0 ? (
                  <p className="text-center text-gray-400 py-4 text-sm italic">لا توجد تصنيفات مضافة بعد.</p>
                ) : (
                  categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          cat.type === 'fabric' ? "bg-blue-500" : cat.type === 'finished_good' ? "bg-green-500" : "bg-gray-400"
                        )} />
                        <div>
                          <p className="font-bold text-sm text-gray-900 dark:text-white">{cat.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {cat.type === 'fabric' ? 'أقمشة (خام)' : cat.type === 'finished_good' ? 'منتج نهائي' : 'عام'}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-lg">مسح الباركود</h3>
              <button 
                onClick={async () => {
                  if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                    html5QrCodeRef.current = null;
                  }
                  setIsScannerOpen(false);
                }} 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <div id="product-barcode-reader" className="w-full overflow-hidden rounded-2xl"></div>
              <p className="text-center text-sm text-gray-500 mt-4">وجه الكاميرا نحو الباركود للمسح</p>
            </div>
          </div>
        </div>
      )}



      {/* Stock Report Modal */}
      {isStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-primary/10 text-brand-primary rounded-xl shrink-0">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">لوحة جرد المخزون (ستوكاج)</h2>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium">نظرة شاملة ومفصلة على رأس المال، التصنيفات، والكميات.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsStockModalOpen(false)}
                  className="sm:hidden p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => handleExportStockage('print')}
                  disabled={isExportingStock !== false}
                  className="p-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-xl border border-gray-200 dark:border-gray-600 transition-colors tooltip flex items-center justify-center pointer-events-auto flex-1 sm:flex-none"
                  title="طباعة التقرير"
                >
                  {isExportingStock === 'print' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                </button>
                <button 
                  onClick={() => handleExportStockage('pdf')}
                  disabled={isExportingStock !== false}
                  className="px-4 py-2 bg-brand-primary text-white hover:bg-brand-secondary rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 flex-1 sm:flex-none"
                >
                  {isExportingStock === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>تصدير PDF</span>
                </button>
                <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
                <button 
                  onClick={() => setIsStockModalOpen(false)}
                  className="hidden sm:flex p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Top Financial Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">إجمالي رأس المال (المخزون)</p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                    {inventoryDetails.totalCapital.toLocaleString()} <span className="text-xs font-bold opacity-70">{settings.currency}</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">القيمة السوقية المتوقعة للبيع</p>
                  <p className="text-xl font-black text-blue-700 dark:text-blue-300">
                    {inventoryDetails.expectedValue.toLocaleString()} <span className="text-xs font-bold opacity-70">{settings.currency}</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">إجمالي القطع المتوفرة</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white">{inventoryDetails.totalPieces.toLocaleString()} <span className="text-xs font-bold">قطعة</span></p>
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">إجمالي الأصناف (الأنواع)</p>
                  <p className="text-xl font-black text-gray-900 dark:text-white">{products.length.toLocaleString()} <span className="text-xs font-bold">صنف</span></p>
                </div>
              </div>

              {/* Alerts & Category Summary Container */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Alerts Box */}
                <div className="md:col-span-1 space-y-4">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-gray-400" /> تنبيهات سريعة
                  </h3>
                  <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl">
                    <div>
                      <p className="font-bold text-orange-700 dark:text-orange-400">منخفض المخزون</p>
                      <p className="text-xs text-orange-600/80 mt-1">المنتجات التي تقل كمياتها عن 5 قطع</p>
                    </div>
                    <span className="text-2xl font-black text-orange-600">{inventoryDetails.lowStockCount}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl">
                    <div>
                      <p className="font-bold text-rose-700 dark:text-rose-400">نفدت تماماً</p>
                      <p className="text-xs text-rose-600/80 mt-1">المنتجات بصفر قطع في المستودع</p>
                    </div>
                    <span className="text-2xl font-black text-rose-600">{inventoryDetails.outOfStockCount}</span>
                  </div>
                </div>

                {/* Categories Table */}
                <div className="md:col-span-2 space-y-4">
                  <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-gray-400" /> تحليل مالي حسب التصنيف
                  </h3>
                  <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 font-bold">التصنيف</th>
                          <th className="px-4 py-3 font-bold">عدد القطع المتوفرة</th>
                          <th className="px-4 py-3 font-bold">قيمة رأس المال</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {Object.entries(inventoryDetails.catStats)
                          .sort((a, b) => b[1].capital - a[1].capital)
                          .map(([cat, stats], idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{cat}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">{stats.pieces}</td>
                            <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{stats.capital.toLocaleString()} {settings.currency}</td>
                          </tr>
                        ))}
                        {Object.keys(inventoryDetails.catStats).length === 0 && (
                           <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">لا يوجد تصنيفات مدخلة بعد.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <button 
            onClick={() => {
              setIsAddModalOpen(true);
              setError(null);
            }}
            className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 text-lg"
          >
            <Plus className="w-6 h-6" />
            <span>منتج جديد</span>
          </button>
          
          {userRole !== 'seller' && (
            <button 
              onClick={() => setIsStockModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white p-4 rounded-2xl transition-colors shadow-sm flex items-center justify-center gap-2 font-bold"
              title="لوحة جرد المخزون (ستوكاج)"
            >
              <ClipboardList className="w-6 h-6" />
              <span className="hidden sm:inline">جرد المخزون</span>
            </button>
          )}

          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-2xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm flex items-center justify-center"
            title="إدارة التصنيفات"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="ابحث عن منتج..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-12 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium shadow-sm"
            />
          </div>
          <button className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3.5 rounded-2xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm flex items-center justify-center">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && !isAddModalOpen && !selectedProduct && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3 text-sm font-bold border border-red-100 dark:border-red-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Products List */}
      {React.useMemo(() => (
        isLoading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-brand-primary" />
            <p className="font-medium text-lg">جاري تحميل المنتجات...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProducts.length > 0 ? filteredProducts.map(product => (
              <div key={product.id} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-3 flex flex-col gap-4 hover:shadow-md transition-shadow">
                {/* Card Top: Image & Info */}
                <div className="flex gap-4">
                  {/* Image Right */}
                  <div className="w-28 h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 shrink-0 overflow-hidden flex items-center justify-center border border-gray-100 dark:border-gray-700 relative group">
                    {product.images && product.images.length > 0 ? (
                      <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => handleDeleteProduct(product.id)}
                        className="w-10 h-10 bg-white text-red-600 rounded-full flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors shadow-lg"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Info Left */}
                  <div className="flex-1 py-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight line-clamp-2 mb-1">{product.name}</h3>
                      <p className="text-brand-primary font-bold text-lg">{Number(product.sell_price).toLocaleString()} {settings.currency}</p>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 w-fit px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                      <span>الكمية: {product.stock_quantity} {product.unit || 'قطعة'}</span>
                      {userRole !== 'seller' && (
                        <>
                          <span className="w-[1px] h-3 bg-gray-300 dark:bg-gray-600 mx-1"></span>
                          <span>القيمة: {(product.stock_quantity * (product.purchase_price || 0)).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                    {(product as any).suppliers?.name && (
                      <div className="mt-2 text-xs font-bold text-gray-400 dark:text-gray-500">
                        المورد: {(product as any).suppliers.name}
                      </div>
                    )}
                  </div>
                </div>
  
                {/* Card Bottom: Actions */}
                <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {userRole !== 'seller' && (
                    <button 
                      onClick={() => navigate('/marketing', { state: { productName: product.name } })}
                      className="flex-1 flex items-center justify-center gap-2 bg-brand-light text-brand-dark hover:bg-brand-primary/20 py-2.5 rounded-xl font-bold transition-colors text-sm"
                    >
                      <Megaphone className="w-4 h-4" />
                      <span>ترويج</span>
                    </button>
                  )}
                  <button 
                    onClick={() => openManageModal(product)}
                    className="flex-1 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 py-2.5 rounded-xl font-bold transition-colors text-sm"
                  >
                    <Settings className="w-4 h-4" />
                    <span>{userRole === 'seller' ? 'عرض التفاصيل' : 'إدارة'}</span>
                  </button>
                </div>
              </div>
            )) : (
              <div className="col-span-full p-12 text-center text-gray-500 font-medium bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
                لا توجد منتجات مطابقة للبحث.
              </div>
            )}
          </div>
        )
      ), [isLoading, filteredProducts, settings.currency])}

      {/* Manage Product Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl w-full max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" dir="rtl">
            
            {/* Header */}
            <div className="p-5 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">لوحة إدارة المنتج</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCopyLink}
                  className="p-2 text-brand-primary hover:bg-brand-primary/10 bg-brand-primary/5 rounded-full transition-colors"
                  title="نسخ رابط المنتج"
                >
                  <LinkIcon className="w-5 h-5" />
                </button>
                <button 
                  onClick={closeManageModal}
                  className="p-2 text-gray-500 hover:text-red-500 bg-gray-100/50 dark:bg-gray-800/50 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3 text-sm font-bold border border-red-100 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {/* Stats Bar */}
              {userRole !== 'seller' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center bg-white/50 dark:bg-gray-800/50">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">المخزون الحالي</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{selectedProduct.stock_quantity} <span className="text-sm text-gray-500">{selectedProduct.unit || 'قطعة'}</span></p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center bg-white/50 dark:bg-gray-800/50">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">قيمة المخزون</p>
                    <p className="text-xl font-bold text-brand-primary">{(selectedProduct.stock_quantity * (selectedProduct.purchase_price || 0)).toLocaleString()}</p>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center bg-white/50 dark:bg-gray-800/50">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">المبيعات</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{selectedProduct.sales || 0}</p>
                  </div>
                </div>
              )}

              {/* Product Data */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-900 dark:text-white text-lg">بيانات المنتج</h4>
                  {userRole !== 'seller' && (
                    !isEditing ? (
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:bg-brand-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                        تعديل البيانات
                      </button>
                    ) : (
                      <button 
                        onClick={handleUpdateProduct}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        حفظ التغييرات
                      </button>
                    )
                  )}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">اسم المنتج</label>
                    <input 
                      type="text" 
                      value={isEditing ? editForm.name : selectedProduct.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      disabled={!isEditing}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الباركود</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={isEditing ? editForm.barcode : (selectedProduct.barcode || '')}
                        onChange={(e) => setEditForm({...editForm, barcode: e.target.value})}
                        disabled={!isEditing}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                        placeholder="أدخل الباركود أو ولده تلقائياً"
                      />
                      {isEditing && (
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              setScannerTarget('edit');
                              setIsScannerOpen(true);
                            }}
                            className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary hover:text-white transition-colors"
                            title="مسح بالكاميرا"
                          >
                            <Camera className="w-5 h-5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => generateBarcode('edit')}
                            className="px-4 py-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary hover:text-white transition-colors text-xs font-bold"
                          >
                            توليد
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">سعر البيع ({settings.currency})</label>
                      <input 
                        type="number" 
                        value={isEditing ? editForm.sell_price : selectedProduct.sell_price}
                        onChange={(e) => setEditForm({...editForm, sell_price: e.target.value === '' ? '' : Number(e.target.value)})}
                        disabled={!isEditing}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                      />
                    </div>
                    {userRole !== 'seller' && (
                      <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">تكلفة الشراء ({settings.currency})</label>
                        <input 
                          type="number" 
                          value={isEditing ? editForm.purchase_price : (selectedProduct.purchase_price || 0)}
                          onChange={(e) => setEditForm({...editForm, purchase_price: e.target.value === '' ? '' : Number(e.target.value)})}
                          disabled={!isEditing}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                        />
                      </div>
                    )}
                    <div className={userRole !== 'seller' ? "col-span-1" : "col-span-2"}>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الكمية</label>
                      <input 
                        type="number" 
                        step="any"
                        value={isEditing ? editForm.stock_quantity : selectedProduct.stock_quantity}
                        onChange={(e) => setEditForm({...editForm, stock_quantity: e.target.value === '' ? '' : Number(e.target.value)})}
                        disabled={!isEditing}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الوحدة</label>
                      <input 
                        type="text" 
                        list="unit-options"
                        value={isEditing ? editForm.unit : (selectedProduct.unit || 'قطعة')}
                        onChange={(e) => setEditForm({...editForm, unit: e.target.value})}
                        disabled={!isEditing}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                        placeholder="مثال: قطعة، كجم، متر"
                      />
                      <datalist id="unit-options">
                        <option value="قطعة" />
                        <option value="كجم" />
                        <option value="جرام" />
                        <option value="متر" />
                        <option value="سم" />
                        <option value="لتر" />
                        <option value="مل" />
                        <option value="كرتون" />
                        <option value="درزن" />
                        <option value="طقم" />
                        <option value="ساعة" />
                        <option value="خدمة" />
                      </datalist>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">التصنيف</label>
                      <select
                        value={isEditing ? editForm.category_id : selectedProduct.category_id}
                        onChange={(e) => {
                          if (e.target.value === 'add_new') {
                            setIsCategoryModalOpen(true);
                            return;
                          }
                          const cat = categories.find(c => c.id === e.target.value);
                          setEditForm({...editForm, category_id: e.target.value, category: cat?.name || ''});
                        }}
                        disabled={!isEditing}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium disabled:opacity-70 disabled:bg-gray-50 dark:disabled:bg-gray-900"
                      >
                        <option value="">اختر التصنيف...</option>
                        <option value="add_new" className="text-brand-primary font-bold">+ إضافة تصنيف جديد</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">المورد</label>
                      <SearchableSelect
                        value={isEditing ? editForm.supplier_id : selectedProduct.supplier_id || ''}
                        onChange={(val) => setEditForm({...editForm, supplier_id: val})}
                        disabled={!isEditing}
                        options={[{value: '', label: 'بدون مورد محدد'}, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                        placeholder="ابحث عن مورد..."
                        className="bg-white dark:bg-gray-800"
                      />
                    </div>
                  </div>
                  
                  {/* Publish Toggle */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">نشر في المتجر</p>
                      <p className="text-xs text-gray-500">عرض هذا المنتج في متجرك الإلكتروني العام</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={isEditing ? editForm.is_published : selectedProduct.is_published !== false}
                        onChange={(e) => isEditing && setEditForm({...editForm, is_published: e.target.checked})}
                        disabled={!isEditing}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-primary/20 dark:peer-focus:ring-brand-primary/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Image Gallery */}
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-lg mb-4">معرض الصور</h4>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                  {/* Add Image Button */}
                  {isEditing && editForm.images.length < 1 && (
                    <>
                      <input 
                        type="file" 
                        ref={editFileInputRef} 
                        onChange={(e) => handleImageUpload(e, false)} 
                        className="hidden" 
                        accept="image/*"
                      />
                      <button 
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={isSaving}
                        className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-500 hover:text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5 transition-all disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-6 h-6 mb-1 animate-spin" /> : <Plus className="w-6 h-6 mb-1" />}
                        <span className="text-xs font-bold">إضافة صورة</span>
                      </button>
                    </>
                  )}
                  
                  {/* Existing Images */}
                  {(isEditing ? editForm.images : selectedProduct.images)?.map((img, idx) => (
                    <div key={idx} className="w-24 h-24 shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden relative group">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <div className="absolute top-1 right-1 bg-brand-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded">الرئيسية</div>
                      )}
                      {isEditing && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={() => removeImage(idx, false)}
                            className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!selectedProduct.images || selectedProduct.images.length === 0) && !isEditing && (
                    <div className="w-24 h-24 shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl w-full max-w-2xl sm:rounded-3xl rounded-t-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200" dir="rtl">
            
            {/* Header */}
            <div className="p-5 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">إضافة منتج جديد</h3>
              <button 
                onClick={() => {
                  setIsAddModalOpen(false);
                  setError(null);
                }}
                className="p-2 text-gray-500 hover:text-red-500 bg-gray-100/50 dark:bg-gray-800/50 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="p-6 overflow-y-auto space-y-6">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3 text-sm font-bold border border-red-100 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {/* Product Data */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">اسم المنتج *</label>
                  <input 
                    type="text" 
                    required
                    value={addForm.name}
                    onChange={(e) => setAddForm({...addForm, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                    placeholder="أدخل اسم المنتج"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الباركود</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={addForm.barcode} 
                      onChange={(e) => setAddForm({...addForm, barcode: e.target.value})}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                      placeholder="أدخل الباركود أو ولده تلقائياً"
                    />
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setScannerTarget('add');
                          setIsScannerOpen(true);
                        }}
                        className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary hover:text-white transition-colors"
                        title="مسح بالكاميرا"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => generateBarcode('add')}
                        className="px-4 py-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary hover:text-white transition-colors text-xs font-bold"
                      >
                        توليد
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">سعر البيع ({settings.currency}) *</label>
                    <input 
                      type="number" 
                      required
                      value={addForm.sell_price}
                      onChange={(e) => setAddForm({...addForm, sell_price: e.target.value === '' ? '' : Number(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold"
                      placeholder="0"
                    />
                  </div>
                  {userRole !== 'seller' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">تكلفة الشراء ({settings.currency})</label>
                      <input 
                        type="number" 
                        value={addForm.purchase_price}
                        onChange={(e) => setAddForm({...addForm, purchase_price: e.target.value === '' ? '' : Number(e.target.value)})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold"
                        placeholder="0"
                      />
                    </div>
                  )}
                  <div className={userRole !== 'seller' ? "col-span-1" : "col-span-2"}>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الكمية المتوفرة</label>
                    <input 
                      type="number" 
                      step="any"
                      value={addForm.stock_quantity}
                      onChange={(e) => setAddForm({...addForm, stock_quantity: e.target.value === '' ? '' : Number(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold"
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">الوحدة</label>
                    <input 
                      type="text" 
                      list="unit-options"
                      value={addForm.unit}
                      onChange={(e) => setAddForm({...addForm, unit: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold"
                      placeholder="مثال: قطعة، كجم، متر"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">التصنيف</label>
                  <select
                    value={addForm.category_id}
                    onChange={(e) => {
                      if (e.target.value === 'add_new') {
                        setIsCategoryModalOpen(true);
                        return;
                      }
                      const cat = categories.find(c => c.id === e.target.value);
                      setAddForm({...addForm, category_id: e.target.value, category: cat?.name || ''});
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  >
                    <option value="">اختر التصنيف...</option>
                    <option value="add_new" className="text-brand-primary font-bold">+ إضافة تصنيف جديد</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">المورد (اختياري)</label>
                  <SearchableSelect
                    value={addForm.supplier_id}
                    onChange={(val) => setAddForm({...addForm, supplier_id: val})}
                    options={[{value: '', label: 'بدون مورد محدد'}, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
                    placeholder="ابحث عن مورد..."
                    className="bg-white dark:bg-gray-800"
                  />
                </div>

                {/* Publish Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">نشر في المتجر</p>
                    <p className="text-xs text-gray-500">عرض هذا المنتج في متجرك الإلكتروني العام</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={addForm.is_published}
                      onChange={(e) => setAddForm({...addForm, is_published: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-primary/20 dark:peer-focus:ring-brand-primary/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                  </label>
                </div>
              </div>

              {/* Image Gallery */}
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-3">صور المنتج (بحد أقصى صورة واحدة)</h4>
                <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
                  <input 
                    type="file" 
                    ref={addFileInputRef} 
                    onChange={(e) => handleImageUpload(e, true)} 
                    className="hidden" 
                    accept="image/*"
                  />
                  {addForm.images.length < 1 && (
                    <button 
                      type="button"
                      onClick={() => addFileInputRef.current?.click()}
                      disabled={isSaving}
                      className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-500 hover:text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5 transition-all disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-6 h-6 mb-1 animate-spin" /> : <Upload className="w-6 h-6 mb-1" />}
                      <span className="text-xs font-bold">رفع صورة</span>
                    </button>
                  )}
                  {addForm.images.map((img, idx) => (
                    <div key={idx} className="w-24 h-24 shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden relative group">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      {idx === 0 && (
                        <div className="absolute top-1 right-1 bg-brand-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded">الرئيسية</div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          type="button"
                          onClick={() => removeImage(idx, true)}
                          className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <button 
                  type="submit"
                  disabled={isSaving || !addForm.name || !addForm.sell_price}
                  className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-sm shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  <span>حفظ المنتج</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden Print Template for Stockage */}
      <div className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none z-[-1] overflow-hidden">
         <div id="stock-report-pdf-template" style={{ width: '210mm', padding: '20mm', backgroundColor: '#ffffff', color: '#000000', direction: 'rtl', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e5e7eb', paddingBottom: '20px', marginBottom: '30px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#111827' }}>لوحة الجرد (ستوكاج)</h1>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>تاريخ النشر: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                {settings.storeLogo ? (
                    <img src={settings.storeLogo} alt="Logo" style={{ height: '60px', objectFit: 'contain' }} />
                ) : (
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: settings.themeColor || '#0ea5e9' }}>{settings.receiptHeader || 'نظام إدارة المتجر'}</div>
                )}
            </div>

            {/* Main Stats */}
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', color: '#111827' }}>الملخص المالي والإحصائي</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '30px' }}>
                <div style={{ padding: '20px', backgroundColor: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: '16px' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#059669', fontWeight: 'bold' }}>إجمالي رأس المال (المخزون)</p>
                    <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#047857' }}>{inventoryDetails.totalCapital.toLocaleString()} {settings.currency}</p>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '16px' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#2563eb', fontWeight: 'bold' }}>القيمة السوقية المتوقعة للبيع</p>
                    <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#1d4ed8' }}>{inventoryDetails.expectedValue.toLocaleString()} {settings.currency}</p>
                </div>
                <div style={{ padding: '20px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#4b5563', fontWeight: 'bold' }}>إجمالي القطع والأصناف</p>
                    <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#111827' }}>
                        {inventoryDetails.totalPieces.toLocaleString()} <span style={{ fontSize: '16px', fontWeight: 'bold' }}>قطعة</span> / {products.length.toLocaleString()} <span style={{ fontSize: '16px', fontWeight: 'bold' }}>صنف</span>
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, padding: '20px', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '16px' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#c2410c', fontWeight: 'bold' }}>منخفض المخزون</p>
                        <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#ea580c' }}>{inventoryDetails.lowStockCount}</p>
                    </div>
                    <div style={{ flex: 1, padding: '20px', backgroundColor: '#fff1f2', border: '1px solid #ffe4e6', borderRadius: '16px' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#e11d48', fontWeight: 'bold' }}>نفدت تماماً</p>
                        <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#be123c' }}>{inventoryDetails.outOfStockCount}</p>
                    </div>
                </div>
            </div>

            {/* Categories Details */}
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', color: '#111827' }}>تحليل مالي حسب التصنيف</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '15px 12px', border: '1px solid #e5e7eb', fontWeight: 'bold', color: '#4b5563' }}>التصنيف</th>
                        <th style={{ padding: '15px 12px', border: '1px solid #e5e7eb', fontWeight: 'bold', color: '#4b5563', width: '25%' }}>عدد القطع المتوفرة</th>
                        <th style={{ padding: '15px 12px', border: '1px solid #e5e7eb', fontWeight: 'bold', color: '#4b5563', width: '35%' }}>قيمة رأس المال</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(inventoryDetails.catStats)
                        .sort((a,b)=>b[1].capital - a[1].capital)
                        .map(([cat, stats], i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td style={{ padding: '15px 12px', border: '1px solid #e5e7eb', fontWeight: 'bold', color: '#111827' }}>{cat}</td>
                            <td style={{ padding: '15px 12px', border: '1px solid #e5e7eb', color: '#374151' }}>{stats.pieces.toLocaleString()}</td>
                            <td style={{ padding: '15px 12px', border: '1px solid #e5e7eb', color: '#059669', fontWeight: 'bold' }}>{stats.capital.toLocaleString()} {settings.currency}</td>
                        </tr>
                    ))}
                    {Object.keys(inventoryDetails.catStats).length === 0 && (
                        <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>لا توجد تصنيفات مدخلة بعد في النظام.</td></tr>
                    )}
                </tbody>
            </table>

            {/* Footer */}
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', marginTop: '40px', paddingTop: '20px', borderTop: '1px dashed #e5e7eb' }}>
               تنبيه: هذه البيانات تعكس حالة المخزون في وقت الاستخراج فقط.
            </div>
         </div>
      </div>

    </div>
  );
}
