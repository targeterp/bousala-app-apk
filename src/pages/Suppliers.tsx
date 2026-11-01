import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Trash2, Edit2, Phone, Building2, User, ShoppingCart, DollarSign, List, PackagePlus, X, Users, FileText, Lock, AlertCircle } from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../utils';
import { useSubscription } from '../components/SubscriptionGuard';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { usePaymentMethods } from '../hooks/usePaymentMethods';

export function Suppliers() {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const { data: paymentMethodsList = [] } = usePaymentMethods();
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases'>('suppliers');
  
  const { data: userId } = useQuery({
    queryKey: ['session_tenant'],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      return tenantIdData || sessionData.session?.user?.id || null;
    }
  });

  const { data: suppliers = [], isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ['suppliers', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('suppliers').select('*').eq('tenant_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products_list', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('products').select('id, name, barcode, purchase_price, sell_price, stock_quantity, unit, category_id, supplier_id').eq('tenant_id', userId).order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: purchases = [], isLoading: isLoadingPurchases } = useQuery({
    queryKey: ['purchases', userId],
    queryFn: async () => {
      if (!userId) return [];
      try {
        const { data, error } = await supabase
          .from('purchases')
          .select(`*, suppliers(name), profiles:created_by(full_name), purchase_items(quantity, unit_price, products(name, unit))`)
          .eq('tenant_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (e) {
        return [];
      }
    },
    enabled: !!userId,
  });

  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const isLoading = !userId || isLoadingSuppliers || isLoadingProducts || isLoadingPurchases || isFetchingDetails;

  const fetchData = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers', userId] });
    queryClient.invalidateQueries({ queryKey: ['products_list', userId] });
    queryClient.invalidateQueries({ queryKey: ['products', userId] });
    queryClient.invalidateQueries({ queryKey: ['purchases', userId] });
  };
  
  // Modals
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Payment Edit & Delete State
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('cash');
  const [editPaymentDate, setEditPaymentDate] = useState<string>('');
  const [editPaymentDescription, setEditPaymentDescription] = useState<string>('');
  const [isSavingEditPayment, setIsSavingEditPayment] = useState<boolean>(false);

  const [paymentToDelete, setPaymentToDelete] = useState<any | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState<boolean>(false);
  
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<string>('');
  
  // Forms
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    company_name: '',
    balance: 0,
    opening_balance: '',
    balance_type: 'debt_on_us' as 'debt_on_us' | 'credit_for_us'
  });
  
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  
  // Purchase Cart
  const [purchaseCart, setPurchaseCart] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState('cash');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  const parseNumber = (val: string): number => {
    if (!val) return 0;
    // Replace comma with dot and remove any non-numeric characters except dot
    const sanitized = val.toString().replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const num = parseFloat(sanitized);
    return isNaN(num) ? 0 : num;
  };

  // Purchase Details Modal
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [isPurchaseDetailsOpen, setIsPurchaseDetailsOpen] = useState(false);

  const [isSupplierDetailsOpen, setIsSupplierDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'purchases' | 'payments'>('purchases');
  const { data: supplierPayments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ['supplierPayments', selectedSupplier?.id],
    queryFn: async () => {
      if (!selectedSupplier?.id) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('entity_id', selectedSupplier.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedSupplier?.id
  });

  const { data: supplierPurchases = [], isLoading: isLoadingSupplierPurchases } = useQuery({
    queryKey: ['supplierPurchases', selectedSupplier?.id],
    queryFn: async () => {
      if (!selectedSupplier?.id) return [];
      const { data, error } = await supabase
        .from('purchases')
        .select(`*, purchase_items(quantity, unit_price, products(name, unit))`)
        .eq('supplier_id', selectedSupplier.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedSupplier?.id
  });

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSavingSupplier) return;

    const savedForm = { ...supplierForm };
    const selected = selectedSupplier ? { ...selectedSupplier } : null;

    setIsSupplierModalOpen(false);
    setSelectedSupplier(null);
    setSupplierForm({ name: '', phone: '', company_name: '', balance: 0, opening_balance: '', balance_type: 'debt_on_us' });

    const promise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;
      
      const rawNum = Math.abs(Number(savedForm.opening_balance) || 0);
      const openingBalance = rawNum === 0 ? 0 : (savedForm.balance_type === 'credit_for_us' ? -rawNum : rawNum);

      if (selected) {
        const oldOpening = Number(selected.opening_balance || 0);
        const newOpening = openingBalance;
        const diff = newOpening - oldOpening;
        const currentBalance = Number(selected.balance || 0);
        const newBalance = currentBalance + diff;

        const { error } = await supabase
          .from('suppliers')
          .update({
            name: savedForm.name,
            phone: savedForm.phone,
            company_name: savedForm.company_name,
            opening_balance: newOpening,
            balance: newBalance
          })
          .eq('id', selected.id);
        if (error) throw error;
      } else {
        const { data: supplierData, error } = await supabase
          .from('suppliers')
          .insert([{ 
            tenant_id: userId,
            name: savedForm.name,
            phone: savedForm.phone,
            company_name: savedForm.company_name,
            opening_balance: openingBalance,
            balance: openingBalance
          }]).select().single();
        if (error) throw error;
      }
      fetchData();
    })();

    toast.promise(promise, {
      loading: selected ? 'جاري التعديل...' : 'جاري إضافة المورد...',
      success: selected ? 'تم تعديل المورد بنجاح' : 'تم إضافة المورد بنجاح',
      error: 'حدث خطأ أثناء حفظ المورد'
    });
  };

  const handleDeleteSupplier = (id: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;

    queryClient.setQueryData(['suppliers', userId], (old: any[]) => old?.filter(s => s.id !== id) || []);

    const promise = (async () => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    })();

    toast.promise(promise, {
      loading: 'جاري الحذف...',
      success: 'تم الحذف بنجاح',
      error: () => {
         fetchData();
         return 'حدث خطأ أثناء الحذف';
      }
    });
  };

  const openEditSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    const op = Number(supplier.opening_balance || 0);
    setSupplierForm({
      name: supplier.name,
      phone: supplier.phone || '',
      company_name: supplier.company_name || '',
      balance: supplier.balance || 0,
      opening_balance: op !== 0 ? Math.abs(op).toString() : '',
      balance_type: op < 0 ? 'credit_for_us' : 'debt_on_us'
    });
    setIsSupplierModalOpen(true);
  };

  // --- Purchase Logic ---
  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productId = e.target.value;
    setSelectedProduct(productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setPurchasePrice(product.purchase_price?.toString() || '0');
      setPurchaseUnit(product.unit || 'قطعة');
    }
  };

  const addToPurchaseCart = () => {
    if (!selectedProduct || !purchaseQty || !purchasePrice) return;
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const qty = parseNumber(purchaseQty);
    const price = parseNumber(purchasePrice);

    if (qty <= 0) {
      toast.error('يرجى إدخال كمية صحيحة');
      return;
    }

    setPurchaseCart([...purchaseCart, {
      product,
      quantity: qty,
      unit_price: price,
      total_price: qty * price,
      unit: purchaseUnit || product.unit || 'قطعة'
    }]);
    
    setSelectedProduct('');
    setPurchaseQty('1');
    setPurchasePrice('');
    setPurchaseUnit('');
  };

  const updatePurchaseCartQty = (index: number, newQty: string) => {
    const qty = parseNumber(newQty) || 0;
    const updated = [...purchaseCart];
    updated[index].quantity = newQty;
    if (qty >= 0) {
      updated[index].total_price = qty * (parseNumber(updated[index].unit_price) || 0);
    }
    setPurchaseCart(updated);
  };

  const updatePurchaseCartPrice = (index: number, newPrice: string) => {
    const price = parseNumber(newPrice) || 0;
    const updated = [...purchaseCart];
    updated[index].unit_price = newPrice;
    if (price >= 0) {
      updated[index].total_price = (parseNumber(updated[index].quantity) || 0) * price;
    }
    setPurchaseCart(updated);
  };

  const removeFromPurchaseCart = (index: number) => {
    setPurchaseCart(purchaseCart.filter((_, i) => i !== index));
  };

  const purchaseTotal = purchaseCart.reduce((sum, item) => sum + item.total_price, 0);

  const handleSavePurchase = async () => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (purchaseCart.length === 0) return;
    
    const paid = parseNumber(paidAmount) || 0;
    if (!purchaseSupplierId && paid < purchaseTotal) {
      toast.error('يجب دفع المبلغ كاملاً في حالة الشراء نقدي بدون مورد، أو قم بتحديد مورد لتسجيل الدين.');
      return;
    }
    
    setIsSavingPurchase(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      
      if (!userId) {
        toast.error('يجب تسجيل الدخول أولاً');
        return;
      }

      if (editingPurchaseId) {
        if (!navigator.onLine) {
          throw new Error('لا يمكن تعديل المشتريات في وضع عدم الاتصال');
        }

        const purchaseItemsPayload = purchaseCart.map(item => ({
          product_id: item.product.id,
          quantity: parseNumber(item.quantity),
          unit_price: parseNumber(item.unit_price)
        }));

        const { error: rpcError } = await supabase.rpc('update_purchase_invoice_v3', {
          p_purchase_id: editingPurchaseId,
          p_tenant_id: userId,
          p_supplier_id: purchaseSupplierId || null,
          p_total_amount: purchaseTotal,
          p_paid_amount: parseNumber(paidAmount) || 0,
          p_payment_method: purchasePaymentMethod,
          p_items: purchaseItemsPayload
        });

        if (rpcError) throw rpcError;

      } else {
        const isToday = purchaseDate === new Date().toISOString().split('T')[0];
        const createdAt = isToday ? new Date().toISOString() : new Date(purchaseDate).toISOString();

        // 1. Create Purchase
        let purchasePayload: any = {
        tenant_id: userId,
        supplier_id: purchaseSupplierId || null,
        total_amount: purchaseTotal,
        paid_amount: parseNumber(paidAmount),
        payment_method: purchasePaymentMethod,
        created_by: userId,
        created_at: createdAt
      };

      console.log('Saving purchase with payload:', purchasePayload);

      let { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .insert([purchasePayload])
        .select()
        .single();

      // Fallback if created_by foreign key fails (profile doesn't exist yet)
      if (purchaseError && (purchaseError.message?.includes('foreign key constraint') || purchaseError.code === '23503')) {
        console.warn('Profile foreign key failed, retrying without created_by');
        const fallbackPayload = { ...purchasePayload };
        delete fallbackPayload.created_by;
        const retry = await supabase.from('purchases').insert([fallbackPayload]).select().single();
        purchaseData = retry.data;
        purchaseError = retry.error;
      }
        
      if (purchaseError) {
        console.error('Purchase insert error:', purchaseError);
        throw purchaseError;
      }
      
      if (!purchaseData) {
        throw new Error('لم يتم استرجاع بيانات الفاتورة بعد الحفظ');
      }

      // 2. Create Purchase Items
      const itemsToInsert = purchaseCart.map(item => ({
        tenant_id: userId,
        purchase_id: purchaseData.id,
        product_id: item.product.id,
        quantity: parseNumber(item.quantity),
        unit_price: parseNumber(item.unit_price),
        total_price: item.total_price
      }));

      console.log('Inserting purchase items:', itemsToInsert);

      const { error: itemsError } = await supabase
        .from('purchase_items')
        .insert(itemsToInsert);

      if (itemsError) {
        console.error('Purchase items insert error:', itemsError);
        throw itemsError;
      }
      
      // 3. Update Product Stock
      for (const item of purchaseCart) {
        const { data: product } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product.id)
          .single();
          
        if (product) {
          await supabase
            .from('products')
            .update({ 
              stock_quantity: Number(product.stock_quantity) + parseNumber(item.quantity),
              purchase_price: parseNumber(item.unit_price) // Update to latest purchase price
            })
            .eq('id', item.product.id);
        }
      }
      } // end else

      toast.success('تم تسجيل المشتريات بنجاح');
      setIsPurchaseModalOpen(false);
      setPurchaseCart([]);
      setPaidAmount('');
      setEditingPurchaseId(null);
      await fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (error: any) {
      console.error('Full error object:', error);
      const errorMsg = error.message || error.details || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      
      if (error.code === '42P01') {
        toast.error('يرجى تنفيذ كود SQL الخاص بالمشتريات أولاً (الجدول غير موجود).');
      } else if (error.code === '42703') {
        toast.error('خطأ في أعمدة الجدول: ' + errorMsg);
      } else {
        toast.error('حدث خطأ أثناء حفظ المشتريات: ' + errorMsg);
      }
    } finally {
      setIsSavingPurchase(false);
    }
  };

  const openEditPurchaseMode = async (purchase: any) => {
    setIsFetchingDetails(true);
    try {
      const { data: fullPurchase, error } = await supabase
        .from('purchases')
        .select(`*, purchase_items(*, products(*))`)
        .eq('id', purchase.id)
        .single();
        
      if (error) throw error;
      
      const restoredCart = fullPurchase.purchase_items.map((item: any) => ({
        product: item.products,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        unit: item.unit || item.products?.unit || 'قطعة'
      }));
      
      setPurchaseCart(restoredCart);
      const supplier = suppliers.find(s => s.id === fullPurchase.supplier_id);
      if (supplier) {
        setSelectedSupplier(supplier);
        setPurchaseSupplierId(supplier.id);
      } else {
        setSelectedSupplier(null);
        setPurchaseSupplierId('');
      }
      setPaidAmount(fullPurchase.paid_amount || 0);
      setPurchasePaymentMethod(fullPurchase.payment_method || 'cash');
      setPurchaseDate(new Date(fullPurchase.created_at).toISOString().split('T')[0]);
      
      setEditingPurchaseId(fullPurchase.id);
      setIsPurchaseDetailsOpen(false); // Close details modal
      setIsPurchaseModalOpen(true);    // Open the comprehensive form modal
      setActiveTab('purchases');
    } catch (err) {
      console.error(err);
      toast.error('فشل جلب تفاصيل المشتريات للتعديل');
    } finally {
      setIsFetchingDetails(false);
    }
  };

  // --- Delete Purchase Logic ---
  const handleDeletePurchase = async (purchaseId: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟ سيتم استرجاع المخزون وتحديث رصيد المورد وحذف المعاملة المالية.')) return;
    
    try {
      // 1. Get purchase details
      const { data: purchase, error: fetchError } = await supabase
        .from('purchases')
        .select('*, purchase_items(product_id, quantity)')
        .eq('id', purchaseId)
        .single();
        
      if (fetchError) throw fetchError;

      // 2. Restore stock (decrease stock since it was a purchase)
      if (purchase.purchase_items && purchase.purchase_items.length > 0) {
        for (const item of purchase.purchase_items) {
          const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
          if (product) {
            await supabase.from('products').update({ stock_quantity: Math.max(0, product.stock_quantity - item.quantity) }).eq('id', item.product_id);
          }
        }
      }

      // 3. Revert supplier balance
      if (purchase.supplier_id) {
        const debt = Number(purchase.total_amount) - Number(purchase.paid_amount);
        const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', purchase.supplier_id).single();
        if (supplier) {
          await supabase.from('suppliers').update({ balance: Number(supplier.balance) - debt }).eq('id', purchase.supplier_id);
        }
      }

      // 4. Delete transaction
      await supabase.from('transactions').delete().eq('reference_type', 'purchase').eq('reference_id', purchaseId);

      // 5. Delete purchase items
      await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);

      // 6. Delete purchase
      await supabase.from('purchases').delete().eq('id', purchaseId);

      setIsPurchaseDetailsOpen(false);
      
      // Optimistic update
      queryClient.setQueryData(['purchases', userId], (old: any[]) => old?.filter(p => p.id !== purchaseId) || []);
      
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('تم حذف الفاتورة بنجاح');
    } catch (error: any) {
      console.error('Error deleting purchase:', error);
      toast.error('حدث خطأ أثناء حذف الفاتورة: ' + (error.message || JSON.stringify(error)));
    }
  };

  // --- Payment Logic ---
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!selectedSupplier || !paymentAmount || isSavingPayment) return;
    setIsSavingPayment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      
      if (!userId) {
        toast.error('يجب تسجيل الدخول أولاً');
        return;
      }

      let payload: any = {
        tenant_id: userId,
        supplier_id: selectedSupplier.id,
        amount: parseNumber(paymentAmount),
        payment_method: paymentMethod,
        created_by: userId
      };

      let { data: paymentData, error } = await supabase
        .from('supplier_payments')
        .insert([payload])
        .select()
        .single();

      // Fallback if created_by foreign key fails (profile doesn't exist yet)
      if (error && error.message?.includes('foreign key constraint')) {
        delete payload.created_by;
        const retry = await supabase.from('supplier_payments').insert([payload]).select().single();
        paymentData = retry.data;
        error = retry.error;
      }
        
      if (error) throw error;

      toast.success('تم تسجيل الدفعة بنجاح');
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      
      // Update selectedSupplier local balance immediately
      const paid = parseNumber(paymentAmount);
      setSelectedSupplier((prev: any) => prev ? {
        ...prev,
        balance: Number(prev.balance || 0) - paid
      } : null);

      fetchData();
      if (selectedSupplier) {
        queryClient.invalidateQueries({ queryKey: ['supplierPayments', selectedSupplier.id] });
      }
    } catch (error: any) {
      console.error('Error saving payment:', error);
      if (error.code === '42P01') {
        toast.error('يرجى تنفيذ كود SQL الخاص بمدفوعات الموردين أولاً.');
      } else {
        toast.error('حدث خطأ أثناء تسجيل الدفعة: ' + (error.message || 'خطأ غير معروف'));
      }
    } finally {
      setIsSavingPayment(false);
    }
  };

  // Open Edit Payment Modal
  const handleOpenEditPayment = (payment: any) => {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.amount?.toString() || '');
    setEditPaymentMethod(payment.payment_method || 'cash');
    const paymentDateStr = payment.date 
      ? new Date(payment.date).toISOString().split('T')[0]
      : (payment.created_at ? new Date(payment.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setEditPaymentDate(paymentDateStr);
    setEditPaymentDescription(payment.description || 'تسديد دفعة للمورد');
  };

  // Save Edited Payment
  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!editingPayment || !selectedSupplier || isSavingEditPayment) return;
    const newAmount = parseNumber(editPaymentAmount);
    if (newAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    setIsSavingEditPayment(true);
    try {
      const supplierId = selectedSupplier.id;
      const oldAmount = Number(editingPayment.amount || 0);
      const diff = newAmount - oldAmount;

      // 1. Fetch latest supplier balance from database
      const { data: supplierData, error: suppErr } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', supplierId)
        .single();
      if (suppErr) throw suppErr;

      // 2. Calculate balance adjustment:
      // For expense: paying more (diff > 0) reduces debt -> balance - diff.
      // If paying less (diff < 0), debt increases -> balance + abs(diff).
      const isExpense = editingPayment.type !== 'income';
      const newBalance = isExpense
        ? Number(supplierData?.balance || 0) - diff
        : Number(supplierData?.balance || 0) + diff;

      // 3. Update supplier balance if amount changed
      if (diff !== 0) {
        const { error: updateErr } = await supabase
          .from('suppliers')
          .update({ balance: newBalance })
          .eq('id', supplierId);
        if (updateErr) throw updateErr;
      }

      // 4. Update transactions
      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          amount: newAmount,
          payment_method: editPaymentMethod,
          description: editPaymentDescription || editingPayment.description,
          date: editPaymentDate || editingPayment.date
        })
        .eq('id', editingPayment.id);
      if (txErr) throw txErr;

      // 5. Update referenced table
      if (editingPayment.reference_type === 'supplier_payment' && editingPayment.reference_id) {
        await supabase
          .from('supplier_payments')
          .update({
            amount: newAmount,
            payment_method: editPaymentMethod
          })
          .eq('id', editingPayment.reference_id);
      } else if (editingPayment.reference_type === 'purchase' && editingPayment.reference_id) {
        const { data: purchase } = await supabase
          .from('purchases')
          .select('paid_amount')
          .eq('id', editingPayment.reference_id)
          .single();
        if (purchase) {
          const newPaidAmount = Math.max(0, Number(purchase.paid_amount || 0) + diff);
          await supabase
            .from('purchases')
            .update({
              paid_amount: newPaidAmount,
              payment_method: editPaymentMethod
            })
            .eq('id', editingPayment.reference_id);
        }
      }

      // 6. Sync UI and cache
      setSelectedSupplier((prev: any) => prev && prev.id === supplierId ? { ...prev, balance: newBalance } : prev);
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['supplierPayments', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplierPurchases', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });

      toast.success('تم تعديل الدفعة وتحديث الحسابات بنجاح');
      setEditingPayment(null);
    } catch (error: any) {
      console.error('Error updating supplier payment:', error);
      toast.error('حدث خطأ أثناء تعديل الدفعة: ' + (error.message || 'خطأ غير معروف'));
    } finally {
      setIsSavingEditPayment(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = async () => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!paymentToDelete || !selectedSupplier || isDeletingPayment) return;

    setIsDeletingPayment(true);
    try {
      const amount = Number(paymentToDelete.amount || 0);
      const supplierId = selectedSupplier.id;

      // 1. Fetch current supplier balance from database
      const { data: supplierData, error: suppErr } = await supabase
        .from('suppliers')
        .select('balance')
        .eq('id', supplierId)
        .single();
      if (suppErr) throw suppErr;

      // 2. Calculate balance adjustment:
      // An expense payment reduced debt to supplier, so deleting it increases debt back.
      // An income refund increased debt/credit, so deleting it decreases debt.
      const isExpense = paymentToDelete.type !== 'income';
      const balanceAdjustment = isExpense ? amount : -amount;
      const newBalance = Number(supplierData?.balance || 0) + balanceAdjustment;

      // 3. Update supplier balance
      const { error: updateErr } = await supabase
        .from('suppliers')
        .update({ balance: newBalance })
        .eq('id', supplierId);
      if (updateErr) throw updateErr;

      // 4. Clean up referenced tables if applicable
      if (paymentToDelete.reference_type === 'supplier_payment' && paymentToDelete.reference_id) {
        await supabase
          .from('supplier_payments')
          .delete()
          .eq('id', paymentToDelete.reference_id);
      } else if (paymentToDelete.reference_type === 'purchase' && paymentToDelete.reference_id) {
        // Deduct paid_amount on purchase
        const { data: purchase } = await supabase
          .from('purchases')
          .select('paid_amount')
          .eq('id', paymentToDelete.reference_id)
          .single();
        if (purchase) {
          const newPaidAmount = Math.max(0, Number(purchase.paid_amount || 0) - amount);
          await supabase
            .from('purchases')
            .update({ paid_amount: newPaidAmount })
            .eq('id', paymentToDelete.reference_id);
        }
      }

      // 5. Delete transaction
      const { error: txErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', paymentToDelete.id);
      if (txErr) throw txErr;

      // 6. Sync UI and cache
      setSelectedSupplier((prev: any) => prev && prev.id === supplierId ? { ...prev, balance: newBalance } : prev);
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['supplierPayments', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplierPurchases', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });

      toast.success('تم حذف الدفعة واستعادة رصيد المورد بنجاح');
      setPaymentToDelete(null);
    } catch (error: any) {
      console.error('Error deleting supplier payment:', error);
      toast.error('حدث خطأ أثناء حذف الدفعة: ' + (error.message || 'خطأ غير معروف'));
    } finally {
      setIsDeletingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الموردين</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">إدارة الموردين، المشتريات، والمدفوعات.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedSupplier(null);
              setPurchaseSupplierId('');
              setPurchaseCart([]);
              setPaidAmount('');
              setEditingPurchaseId(null);
              setIsPurchaseModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm"
          >
            <PackagePlus className="w-4 h-4" />
            <span>فاتورة مشتريات سريعة</span>
          </button>
          
          {activeTab === 'suppliers' && (
            <button
              onClick={() => {
                setSelectedSupplier(null);
                setSupplierForm({ name: '', phone: '', company_name: '', balance: 0, opening_balance: '', balance_type: 'debt_on_us' });
                setIsSupplierModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-brand-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مورد</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 space-x-reverse border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'suppliers' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Users className="w-4 h-4" />
          قائمة الموردين
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'purchases' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <List className="w-4 h-4" />
          سجل المشتريات
        </button>
      </div>

      {/* Tab Content: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-500 font-medium bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              لا يوجد موردين مسجلين
            </div>
          ) : (
            suppliers.map((supplier) => (
              <div 
                key={supplier.id} 
                onClick={() => {
                  setSelectedSupplier(supplier);
                  setIsSupplierDetailsOpen(true);
                  setDetailsTab('purchases');
                }}
                className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg">{supplier.name}</h3>
                      {supplier.company_name && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{supplier.company_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditSupplier(supplier);
                      }}
                      className="p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSupplier(supplier.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mb-6 flex-1">
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span dir="ltr">{supplier.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">الرصيد:</span>
                    <span className={cn(
                      "font-bold text-lg",
                      Number(supplier.balance) > 0 ? "text-red-500" : 
                      Number(supplier.balance) < 0 ? "text-emerald-500" : "text-gray-900 dark:text-white"
                    )}>
                      {Math.abs(Number(supplier.balance)).toLocaleString()} {settings.currency}
                      <span className="text-xs font-normal ml-1">
                        {Number(supplier.balance) > 0 ? '(دين علينا)' : Number(supplier.balance) < 0 ? '(رصيد لنا)' : ''}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSupplier(supplier);
                      setPurchaseSupplierId(supplier.id);
                      setIsPurchaseModalOpen(true);
                      setPurchaseCart([]);
                      setPurchaseDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="flex items-center justify-center gap-2 bg-brand-light text-brand-dark hover:bg-brand-primary/20 py-2.5 rounded-xl font-bold transition-colors text-sm"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>شراء</span>
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSupplier(supplier);
                      setIsPaymentModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 py-2.5 rounded-xl font-bold transition-colors text-sm"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>تسديد دفعة</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: Purchases */}
      {activeTab === 'purchases' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-bold text-gray-900 dark:text-white">سجل المشتريات</h3>
            <button
              onClick={() => exportTableToPDF('purchases-table', 'سجل_المشتريات')}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>تحميل PDF</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table id="purchases-table" className="w-full text-right">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-sm">
                <tr>
                  <th className="px-6 py-4 font-bold">رقم الفاتورة</th>
                  <th className="px-6 py-4 font-bold">التاريخ</th>
                  <th className="px-6 py-4 font-bold">المورد</th>
                  <th className="px-6 py-4 font-bold">المنتجات</th>
                  <th className="px-6 py-4 font-bold">الإجمالي</th>
                  <th className="px-6 py-4 font-bold">المدفوع</th>
                  <th className="px-6 py-4 font-bold">المستخدم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-medium">
                      لا توجد مشتريات مسجلة
                    </td>
                  </tr>
                ) : (
                  purchases.map((purchase) => (
                    <tr 
                      key={purchase.id} 
                      onClick={() => {
                        setSelectedPurchase(purchase);
                        setIsPurchaseDetailsOpen(true);
                      }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 text-sm font-mono text-gray-500">
                        {purchase.id.substring(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 font-medium">
                        {new Date(purchase.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-bold">
                        {purchase.suppliers?.name || <span className="text-gray-500 font-medium">مورد عام (نقدية)</span>}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {purchase.purchase_items && purchase.purchase_items.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {purchase.purchase_items.slice(0, 2).map((item: any, idx: number) => (
                              <span key={idx} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300">
                                {item.products?.name || 'منتج غير معروف'} {item.quantity ? `(${item.quantity} ${item.products?.unit || 'قطعة'})` : ''}
                              </span>
                            ))}
                            {purchase.purchase_items.length > 2 && (
                              <span className="bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md text-xs font-bold">
                                +{purchase.purchase_items.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-white">
                        {Number(purchase.total_amount).toLocaleString()} {settings.currency}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(purchase.paid_amount).toLocaleString()} {settings.currency}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {purchase.profiles?.full_name || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
              </h2>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  اسم المورد *
                </label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  اسم الشركة (اختياري)
                </label>
                <input
                  type="text"
                  value={supplierForm.company_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  رقم الهاتف (اختياري)
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-left"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  الرصيد الافتتاحي ({settings.currency})
                </label>

                {/* Balance Direction Selector: Debt vs Credit */}
                <div className="grid grid-cols-2 gap-2 mb-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierForm(prev => ({
                        ...prev,
                        balance_type: 'debt_on_us',
                        opening_balance: prev.opening_balance ? Math.abs(Number(prev.opening_balance) || 0).toString() : prev.opening_balance
                      }));
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                      supplierForm.balance_type === 'debt_on_us'
                        ? "bg-red-500 text-white shadow-xs"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    <span>🔴 دين له (مستحق علينا)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSupplierForm(prev => ({
                        ...prev,
                        balance_type: 'credit_for_us',
                        opening_balance: prev.opening_balance ? Math.abs(Number(prev.opening_balance) || 0).toString() : prev.opening_balance
                      }));
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                      supplierForm.balance_type === 'credit_for_us'
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    <span>🟢 رصيد لنا (طرف المورد)</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={supplierForm.opening_balance}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Detect if user typed minus sign e.g. -1000
                      if (val.startsWith('-')) {
                        const absVal = val.replace(/^-+/, '');
                        setSupplierForm(prev => ({
                          ...prev,
                          balance_type: 'credit_for_us',
                          opening_balance: absVal
                        }));
                      } else {
                        setSupplierForm(prev => ({ ...prev, opening_balance: val }));
                      }
                    }}
                    className={cn(
                      "w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border rounded-xl focus:ring-2 outline-none transition-all font-bold pl-24",
                      supplierForm.balance_type === 'credit_for_us'
                        ? "border-emerald-300 dark:border-emerald-700/60 focus:ring-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-gray-200 dark:border-gray-700 focus:ring-brand-primary"
                    )}
                    placeholder="0.00"
                  />
                  <span className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs px-2 py-1 rounded-md",
                    supplierForm.balance_type === 'credit_for_us'
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                  )}>
                    {supplierForm.balance_type === 'credit_for_us' ? 'رصيد لنا (-)' : 'دين علينا (+)'}
                  </span>
                </div>

                {/* Helpful status indicator */}
                {supplierForm.opening_balance && Number(supplierForm.opening_balance) !== 0 ? (
                  <div className={cn(
                    "mt-2 p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border",
                    supplierForm.balance_type === 'credit_for_us'
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
                      : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/40"
                  )}>
                    <span className="w-2 h-2 rounded-full shrink-0 animate-pulse bg-current" />
                    <span>
                      {supplierForm.balance_type === 'credit_for_us'
                        ? `سيتم تسجيل مبلغ ${Math.abs(Number(supplierForm.opening_balance)).toLocaleString()} ${settings.currency} كرصيد لنا طرف المورد (دفعة مقدمة / مستحق لنا).`
                        : `سيتم تسجيل مبلغ ${Math.abs(Number(supplierForm.opening_balance)).toLocaleString()} ${settings.currency} كدين للمورد علينا.`}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    اختر "دين له" إذا كان يطلبك مسبقاً، أو "رصيد لنا" إذا كان لديك مبلغ مدفوع مقدماً طرف المورد.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl transition-colors font-bold shadow-lg shadow-brand-primary/20 flex items-center justify-center disabled:opacity-70"
                >
                  {isSavingSupplier ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl transition-colors font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-brand-primary" />
                  {editingPurchaseId ? 'تعديل فاتورة مشتريات' : 'فاتورة مشتريات سريعة / تسجيل مشتريات'}
                </h2>
                {selectedSupplier && (
                  <p className="text-sm text-gray-500 mt-1 font-medium">المورد: {selectedSupplier.name}</p>
                )}
              </div>
              <button 
                onClick={() => {
                  setIsPurchaseModalOpen(false);
                  setEditingPurchaseId(null);
                  setPurchaseCart([]);
                }} 
                className="p-2 text-gray-400 hover:text-gray-600 bg-white dark:bg-gray-800 rounded-full shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {!selectedSupplier && !editingPurchaseId && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المورد (اختياري)</label>
                  <select
                    value={purchaseSupplierId}
                    onChange={(e) => setPurchaseSupplierId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  >
                    <option value="">مورد عام / شراء نقدي مباشر</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.company_name ? `(${s.company_name})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {editingPurchaseId && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400 p-4 rounded-xl flex items-center gap-3">
                  <Edit2 className="w-5 h-5 shrink-0" />
                  <div>
                    <h3 className="font-bold">وضع التعديل مفعل</h3>
                    <p className="text-sm opacity-80">أنت الآن تقوم بتعديل الفاتورة رقم: {editingPurchaseId.substring(0, 8)}</p>
                  </div>
                </div>
              )}
              {/* Date Field */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ العملية</label>
                <input 
                  type="date" 
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                />
              </div>

              {/* Add Item Form */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold text-gray-500 mb-1">المنتج</label>
                    <SearchableSelect
                      value={selectedProduct}
                      onChange={(val) => handleProductSelect({ target: { value: val } } as any)}
                      options={products.map(p => ({ value: p.id, label: p.name, subtitle: `${p.stock_quantity} ${p.unit || 'قطعة'}` }))}
                      placeholder="اختر منتجاً..."
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">الكمية</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseQty}
                      onChange={(e) => setPurchaseQty(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-sm font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">الوحدة</label>
                    <input
                      type="text"
                      list="units-list"
                      value={purchaseUnit}
                      onChange={(e) => setPurchaseUnit(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-sm"
                      placeholder="قطعة"
                    />
                    <datalist id="units-list">
                      <option value="قطعة" />
                      <option value="متر" />
                      <option value="كجم" />
                      <option value="لتر" />
                      <option value="درزن" />
                    </datalist>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-gray-500 mb-1">تكلفة الوحدة ({settings.currency})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none text-sm font-bold"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={addToPurchaseCart}
                  disabled={!selectedProduct || !purchaseQty || !purchasePrice}
                  className="w-full bg-brand-light text-brand-dark hover:bg-brand-primary/20 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                >
                  إضافة للقائمة
                </button>
              </div>

              {/* Cart List */}
              {purchaseCart.length > 0 && (
                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm min-w-[500px]">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                        <tr>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">المنتج</th>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">الكمية</th>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">التكلفة</th>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">الإجمالي</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {purchaseCart.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 font-medium whitespace-nowrap">{item.product.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.quantity}
                                  onChange={(e) => updatePurchaseCartQty(idx, e.target.value)}
                                  className="w-16 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none text-center font-bold"
                                />
                                <span className="text-gray-500 text-xs">{item.unit}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.unit_price}
                                onChange={(e) => updatePurchaseCartPrice(idx, e.target.value)}
                                className="w-20 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary outline-none text-center font-bold"
                              />
                            </td>
                            <td className="px-4 py-2 font-bold text-brand-primary whitespace-nowrap">{Number(item.total_price || 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-left whitespace-nowrap">
                              <button onClick={() => removeFromPurchaseCart(idx)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer / Payment */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="text-lg">
                  <span className="text-gray-500">الإجمالي: </span>
                  <span className="font-black text-2xl text-gray-900 dark:text-white">{purchaseTotal.toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">المدفوع:</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full sm:w-24 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-emerald-600"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">الطريقة:</label>
                    <select
                      value={purchasePaymentMethod}
                      onChange={(e) => setPurchasePaymentMethod(e.target.value)}
                      className="w-full sm:w-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-medium text-sm"
                    >
                      {paymentMethodsList.map(method => (
                        <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button
                onClick={handleSavePurchase}
                disabled={purchaseCart.length === 0 || isSavingPurchase}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-sm shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSavingPurchase ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingCart className="w-5 h-5" />}
                <span>حفظ المشتريات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تسديد دفعة للمورد</h2>
              <p className="text-sm text-gray-500 mt-1">{selectedSupplier.name}</p>
            </div>
            <form onSubmit={handleSavePayment} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  المبلغ ({settings.currency})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold text-lg text-emerald-600 mb-4"
                  placeholder="0"
                />
                
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                >
                  {paymentMethodsList.map(method => (
                    <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingPayment}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl transition-colors font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center disabled:opacity-70"
                >
                  {isSavingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تأكيد الدفع'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl transition-colors font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && selectedSupplier && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] border border-gray-100 dark:border-gray-800" dir="rtl">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-brand-primary" />
                  <span>تعديل الدفعة</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedSupplier.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePayment} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  المبلغ ({settings.currency})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold text-lg text-emerald-600"
                  placeholder="0"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  طريقة الدفع
                </label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-sm"
                >
                  {paymentMethodsList.map(method => (
                    <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  تاريخ الدفعة
                </label>
                <input
                  type="date"
                  value={editPaymentDate}
                  onChange={(e) => setEditPaymentDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  البيان / الوصف
                </label>
                <input
                  type="text"
                  value={editPaymentDescription}
                  onChange={(e) => setEditPaymentDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-sm"
                  placeholder="وصف الدفعة"
                />
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                💡 سيتم تسوية فرق المبلغ تلقائياً وتحديث رصيد المورد المستحق والمعاملة المالية.
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingEditPayment}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2.5 rounded-xl transition-colors font-bold shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-70 text-sm"
                >
                  {isSavingEditPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl transition-colors font-bold text-sm"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Payment Confirm Modal */}
      {paymentToDelete && selectedSupplier && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col border border-gray-100 dark:border-gray-800" dir="rtl">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">تأكيد حذف الدفعة</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                هل أنت متأكد من حذف هذه الدفعة بقيمة <span className="font-bold text-gray-900 dark:text-white">{Number(paymentToDelete.amount).toLocaleString()} {settings.currency}</span>؟
              </p>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 text-right leading-relaxed mb-6">
                ⚠️ سيتم استرجاع هذا المبلغ وإضافته إلى رصيد المورد المستحق، وحذف قيد المصروف من حركة الصندوق.
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDeletePayment}
                  disabled={isDeletingPayment}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl transition-colors font-bold shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-70 text-sm"
                >
                  {isDeletingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تأكيد الحذف'}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentToDelete(null)}
                  disabled={isDeletingPayment}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl transition-colors font-bold text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Details Modal */}
      {isPurchaseDetailsOpen && selectedPurchase && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300" dir="rtl">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <PackagePlus className="w-6 h-6 text-brand-primary" />
                تفاصيل المشتريات
              </h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => openEditPurchaseMode(selectedPurchase)}
                  className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                  title="تعديل الفاتورة"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleDeletePurchase(selectedPurchase.id)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-full transition-colors"
                  title="حذف الفاتورة"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsPurchaseDetailsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">المورد</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-brand-primary" />
                    {selectedPurchase.suppliers?.name || <span className="text-gray-500">مورد عام (نقدية)</span>}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">التاريخ</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <List className="w-4 h-4 text-brand-primary" />
                    {new Date(selectedPurchase.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">رقم الفاتورة</p>
                  <p className="font-bold text-gray-900 dark:text-white font-mono">
                    {selectedPurchase.id.substring(0, 8)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">المستخدم</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-brand-primary" />
                    {selectedPurchase.profiles?.full_name || '-'}
                  </p>
                </div>
              </div>

              {/* Items List */}
              {selectedPurchase.purchase_items && selectedPurchase.purchase_items.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-brand-primary" />
                    المنتجات
                  </h4>
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-100 dark:border-gray-800">
                        <tr>
                          <th className="px-4 py-3">المنتج</th>
                          <th className="px-4 py-3">الكمية</th>
                          <th className="px-4 py-3">سعر الشراء</th>
                          <th className="px-4 py-3">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {selectedPurchase.purchase_items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.products?.name || 'منتج غير معروف'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.quantity} {item.products?.unit || 'قطعة'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.unit_price ? `${item.unit_price.toLocaleString()} ${settings.currency}` : '-'}</td>
                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                              {item.quantity && item.unit_price ? `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>الإجمالي</span>
                  <span>{Number(selectedPurchase.total_amount).toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>المدفوع</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{Number(selectedPurchase.paid_amount).toLocaleString()} {settings.currency}</span>
                </div>
                {(Number(selectedPurchase.total_amount) - Number(selectedPurchase.paid_amount)) > 0 && (
                  <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span>الباقي (دين علينا)</span>
                    <span>{(Number(selectedPurchase.total_amount) - Number(selectedPurchase.paid_amount)).toLocaleString()} {settings.currency}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Supplier Details Modal */}
      {isSupplierDetailsOpen && selectedSupplier && (() => {
        const activeSupplier = suppliers.find((s: any) => s.id === selectedSupplier?.id) || selectedSupplier;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
              {/* Header */}
              <div className="bg-brand-dark p-6 text-white relative">
                <button 
                  onClick={() => setIsSupplierDetailsOpen(false)}
                  className="absolute top-4 left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-20"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                  <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center text-4xl font-bold backdrop-blur-sm border border-white/20 shrink-0">
                    <Building2 className="w-10 h-10" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-1">{activeSupplier.name}</h2>
                    {activeSupplier.company_name && (
                      <p className="text-white/80 text-lg mb-2">{activeSupplier.company_name}</p>
                    )}
                    {activeSupplier.phone && (
                      <p className="text-white/60 font-mono mb-4">{activeSupplier.phone}</p>
                    )}
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          setIsSupplierDetailsOpen(false);
                          setPurchaseSupplierId(activeSupplier.id);
                          setIsPurchaseModalOpen(true);
                          setPurchaseCart([]);
                          setPurchaseDate(new Date().toISOString().split('T')[0]);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2.5 rounded-xl font-bold transition-colors"
                      >
                        <PackagePlus className="w-5 h-5" />
                        <span>شراء جديد</span>
                      </button>
                      <button 
                        onClick={() => {
                          setIsPaymentModalOpen(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-bold transition-colors"
                      >
                        <DollarSign className="w-5 h-5" />
                        <span>تسديد دفعة</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
                  <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10 text-center">
                    <p className="text-white/70 text-xs font-bold mb-1">إجمالي المشتريات</p>
                    <p className="text-lg font-bold">
                      {supplierPurchases.reduce((sum, p) => sum + Number(p.total_amount), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className={cn(
                    "backdrop-blur-sm rounded-2xl p-3 border text-center",
                    Number(activeSupplier.balance) > 0 ? "bg-red-500/20 border-red-500/30 text-red-100" : 
                    Number(activeSupplier.balance) < 0 ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-100" : "bg-white/10 border-white/10 text-white"
                  )}>
                    <p className="text-white/70 text-xs font-bold mb-1">الرصيد</p>
                    <p className="text-lg font-bold">
                      {Math.abs(Number(activeSupplier.balance)).toLocaleString()}
                      <span className="text-xs mr-1 font-normal">
                        {Number(activeSupplier.balance) > 0 ? '(دين علينا)' : Number(activeSupplier.balance) < 0 ? '(رصيد لنا)' : ''}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4">
                {[
                  { id: 'purchases', label: 'المشتريات', icon: ShoppingCart },
                  { id: 'payments', label: 'الدفعات المسددة', icon: DollarSign },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailsTab(tab.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-4 font-bold text-sm border-b-2 transition-colors",
                      detailsTab === tab.id 
                        ? "border-brand-primary text-brand-primary" 
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50 dark:bg-gray-900/50">
                {detailsTab === 'purchases' && (
                  <div className="space-y-4">
                    {supplierPurchases.length > 0 ? (
                      <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {supplierPurchases.map(purchase => (
                            <div key={purchase.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-bold text-gray-900 dark:text-white">فاتورة #{purchase.id.substring(0, 8)}</p>
                                  {Number(purchase.total_amount) - Number(purchase.paid_amount) > 0 ? (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-bold">
                                      غير مسددة بالكامل
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-xs font-bold">
                                      مسددة
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <span>{new Date(purchase.created_at).toLocaleDateString('ar-SA')}</span>
                                  <span>•</span>
                                  <span>{purchase.purchase_items?.length || 0} أصناف</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-6">
                                <div className="text-left">
                                  <p className="text-xs text-gray-500 mb-1">الإجمالي</p>
                                  <p className="font-bold text-gray-900 dark:text-white">{Number(purchase.total_amount).toLocaleString()}</p>
                                </div>
                                <div className="text-left">
                                  <p className="text-xs text-gray-500 mb-1">المدفوع</p>
                                  <p className="font-bold text-emerald-600">{Number(purchase.paid_amount).toLocaleString()}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-8 font-medium">لا توجد مشتريات مسجلة.</p>
                    )}
                  </div>
                )}

                {detailsTab === 'payments' && (
                  <div className="space-y-4">
                    {supplierPayments.length > 0 ? (
                      <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {supplierPayments.map(payment => (
                            <div key={payment.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-gray-900 dark:text-white">
                                    {payment.description || 'دفعة نقدية'}
                                  </p>
                                  {payment.reference_type === 'purchase' && (
                                    <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                      فاتورة مشتريات
                                    </span>
                                  )}
                                  {payment.reference_type === 'supplier_payment' && (
                                    <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                                      تسديد دفعة
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                                  <span>{payment.date ? new Date(payment.date).toLocaleDateString('ar-SA') : new Date(payment.created_at).toLocaleDateString('ar-SA')}</span>
                                  {payment.payment_method && (
                                    <>
                                      <span>•</span>
                                      <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 font-medium">
                                        {paymentMethodsList.find(m => m.method_id === payment.payment_method)?.name || payment.payment_method}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-4">
                                <span className={`font-black text-lg ${payment.type === 'income' ? 'text-red-600' : 'text-emerald-600'}`} dir="ltr">
                                  {payment.type === 'income' ? '+' : '-'}{Number(payment.amount).toLocaleString()} {settings.currency}
                                </span>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEditPayment(payment);
                                    }}
                                    className="p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                                    title="تعديل الدفعة"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPaymentToDelete(payment);
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all"
                                    title="حذف الدفعة"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-8 font-medium">لا توجد دفعات مسجلة.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
