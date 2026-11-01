import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Scissors, Kanban, Users, Trash2, CheckCircle2, MessageCircle, DollarSign, Calendar, Clock, X, Edit2, FileText, Lock } from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../utils';
import { useSubscription } from '../components/SubscriptionGuard';
import { useNavigate } from 'react-router-dom';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { usePaymentMethods } from '../hooks/usePaymentMethods';

const parseArabicNumber = (str: string | number) => {
  if (str === null || str === undefined) return 0;
  if (typeof str === 'number') return str;
  const englishStr = str.toString().replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
  const parsed = Number(englishStr);
  return isNaN(parsed) ? 0 : parsed;
};

import { OrderCard } from '../components/OrderCard';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

export function Production() {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { isExpired, setShowRenewModal } = useSubscription();
  const { data: paymentMethodsList = [] } = usePaymentMethods();
  const [activeTab, setActiveTab] = useState<'board' | 'new' | 'tailors'>('board');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({ isOpen: false, message: '', onConfirm: () => {} });
  const [kanbanPage, setKanbanPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState<Record<string, number>>({
    pending: 10,
    tailoring: 10,
    ready: 10,
    delivered: 10
  });

  const loadMoreCards = (status: string) => {
    setVisibleCount(prev => ({ ...prev, [status]: (prev[status] || 10) + 10 }));
  };

  // Data Fetching with React Query
  const { data: userId } = useQuery({
    queryKey: ['session_tenant'],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      return tenantIdData || sessionData.session?.user?.id || null;
    }
  });

  const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: ['custom_orders', userId, kanbanPage],
    queryFn: async () => {
      if (!userId) return [];
      const tenantId = userId;
      // First try with the target_product_id relation
      let ordersRes = await supabase.from('custom_orders').select(`
        *,
        customers (name, phone, balance),
        custom_order_items (
          id, product_id, target_product_id, tailor_id, fabric_meters, tailoring_cost, notes, quantity,
          fabric:products!custom_order_items_product_id_fkey (name),
          target:products!custom_order_items_target_product_id_fkey (name),
          tailors (name)
        )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(kanbanPage * 100);

      // If it fails (likely due to missing column/relation), fallback to simpler query
      if (ordersRes.error) {
        ordersRes = await supabase.from('custom_orders').select(`
          *,
          customers (name, phone, balance),
          custom_order_items (
            id, product_id, target_product_id, fabric_meters, tailoring_cost, notes, tailor_id, quantity,
            tailors (name)
          )
        `)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(kanbanPage * 100);
        
        // If the second query also fails (e.g. target_product_id doesn't exist at all), try without it
        if (ordersRes.error) {
          ordersRes = await supabase.from('custom_orders').select(`
            *,
            customers (name, phone),
            custom_order_items (
              id, product_id, fabric_meters, tailoring_cost, notes, tailor_id,
              tailors (name)
            )
          `)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(kanbanPage * 100);
        }

        // Fetch products separately to avoid foreign key ambiguity issues
        const { data: allProducts } = await supabase.from('products').select('id, name').eq('tenant_id', tenantId);
        const productsMap = new Map(allProducts?.map(p => [p.id, p]) || []);

        // Map products to fabric to match the expected structure in the UI
        if (ordersRes.data) {
          ordersRes.data = ordersRes.data.map(order => ({
            ...order,
            custom_order_items: order.custom_order_items?.map((item: any) => ({
              ...item,
              fabric: productsMap.get(item.product_id) || { name: 'قماش غير محدد' },
              target: item.target_product_id ? productsMap.get(item.target_product_id) : null
            }))
          }));
        }
      }
      return ordersRes.data || [];
    },
    enabled: !!userId,
  });

  const { data: tailors = [], isLoading: isLoadingTailors } = useQuery({
    queryKey: ['tailors', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('tailors').select('*').eq('tenant_id', userId).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', userId).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products_list', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from('products').select('id, name, barcode, purchase_price, sell_price, unit, category, stock_quantity').eq('tenant_id', userId).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  const isLoading = !userId || isLoadingOrders || isLoadingTailors || isLoadingCustomers || isLoadingProducts;

  const fetchData = (showLoading = true) => {
    queryClient.invalidateQueries({ queryKey: ['custom_orders', userId] });
    queryClient.invalidateQueries({ queryKey: ['tailors', userId] });
    queryClient.invalidateQueries({ queryKey: ['customers', userId] });
    queryClient.invalidateQueries({ queryKey: ['products_list', userId] });
    queryClient.invalidateQueries({ queryKey: ['products', userId] });
  };

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && (data === 'seller' || data === 'accountant')) {
        navigate('/');
      }
    });
  }, [navigate]);
  
  // New Order Form
  const [newOrder, setNewOrder] = useState({
    customer_id: '',
    product_id: '', // Raw material
    target_product_id: '', // Finished good
    quantity: '1', // Quantity of pieces
    fabric_meters: '',
    tailor_id: '', // Worker
    tailoring_cost: '', // Production cost
    total_price: '',
    advance_payment: '',
    advance_payment_method: 'cash',
    expected_delivery_date: '',
    notes: ''
  });

  // New Tailor Form
  const [newTailor, setNewTailor] = useState({ name: '', phone: '' });
  const [isAddTailorModalOpen, setIsAddTailorModalOpen] = useState(false);

  // Pay Tailor Form
  const [payTailorForm, setPayTailorForm] = useState({ tailor_id: '', amount: '', reference_note: '', date: new Date().toISOString().split('T')[0], payment_method: 'cash' });
  const [isPayTailorModalOpen, setIsPayTailorModalOpen] = useState(false);

  // Internal Production Form
  const [isInternalProductionModalOpen, setIsInternalProductionModalOpen] = useState(false);
  const [internalProduction, setInternalProduction] = useState({
    product_id: '', // Raw material
    fabric_meters: '',
    target_product_id: '', // Produced Product
    quantity: '1',
    tailor_id: '', // Worker
    tailoring_cost: '', // Production cost
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Tailor History Modal
  const [selectedTailor, setSelectedTailor] = useState<any>(null);
  const [isTailorHistoryModalOpen, setIsTailorHistoryModalOpen] = useState(false);
  const [tailorHistory, setTailorHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editOrderForm, setEditOrderForm] = useState({
    customer_id: '',
    total_price: '',
    advance_payment: '',
    advance_payment_method: 'cash',
    expected_delivery_date: '',
    notes: '',
    product_id: '',
    target_product_id: '',
    fabric_meters: '',
    tailor_id: '',
    tailoring_cost: '',
    quantity: '1'
  });

  // Edit Payment Modal
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ amount: '', date: '', note: '' });

  // Edit Operation Modal
  const [editingOperation, setEditingOperation] = useState<any>(null);
  const [editOperationForm, setEditOperationForm] = useState({ tailoring_cost: '', fabric_meters: '' });

  const handleAddTailor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user.id;

      const { error } = await supabase.from('tailors').insert([{ ...newTailor, tenant_id: tenantId }]);
      if (error) throw error;
      
      setNewTailor({ name: '', phone: '' });
      setIsAddTailorModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error adding tailor:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePayTailor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user?.id;
      
      const isToday = payTailorForm.date === new Date().toISOString().split('T')[0];
      const createdAt = isToday ? new Date().toISOString() : new Date(payTailorForm.date).toISOString();

      let payload: any = {
        tailor_id: payTailorForm.tailor_id,
        amount: parseArabicNumber(payTailorForm.amount),
        reference_note: payTailorForm.reference_note,
        payment_method: payTailorForm.payment_method,
        created_by: user?.id,
        tenant_id: tenantId,
        created_at: createdAt
      };

      let { error } = await supabase.from('tailor_payments').insert([payload]);

      // Fallback if created_by foreign key fails (profile doesn't exist yet)
      if (error && error.message?.includes('foreign key constraint')) {
        delete payload.created_by;
        const retry = await supabase.from('tailor_payments').insert([payload]);
        error = retry.error;
      }

      if (error) throw error;
      
      setPayTailorForm({ tailor_id: '', amount: '', reference_note: '', date: new Date().toISOString().split('T')[0], payment_method: 'cash' });
      setIsPayTailorModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error paying tailor:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user?.id;
      
      const quantity = Math.max(1, parseInt(newOrder.quantity) || 1);
      const totalFabricMeters = parseArabicNumber(newOrder.fabric_meters) * quantity;
      const totalTailoringCost = parseArabicNumber(newOrder.tailoring_cost) * quantity;
      const orderTotalPrice = parseArabicNumber(newOrder.total_price);
      
      const metaNotes = JSON.stringify({
        notes: newOrder.notes,
        quantity: quantity,
        meters_per_unit: parseArabicNumber(newOrder.fabric_meters)
      });
      
      const { error } = await supabase.rpc('create_custom_order_v3', {
        p_customer_id: newOrder.customer_id || null,
        p_product_id: newOrder.product_id,
        p_target_product_id: newOrder.target_product_id || null,
        p_fabric_meters: totalFabricMeters,
        p_tailor_id: newOrder.tailor_id,
        p_tailoring_cost: totalTailoringCost,
        p_total_price: orderTotalPrice,
        p_advance_payment: parseArabicNumber(newOrder.advance_payment),
        p_advance_payment_method: newOrder.advance_payment_method,
        p_expected_delivery_date: newOrder.expected_delivery_date || null,
        p_notes: metaNotes,
        p_tenant_id: tenantId,
        p_quantity: quantity
      });

      if (error) throw error;

      setNewOrder({
        customer_id: '', product_id: '', target_product_id: '', quantity: '1', fabric_meters: '', tailor_id: '',
        tailoring_cost: '', total_price: '', advance_payment: '', advance_payment_method: 'cash', expected_delivery_date: '', notes: ''
      });
      setActiveTab('board');
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('تمت إضافة الطلب بنجاح');
    } catch (error: any) {
      console.error('Error adding custom order:', error);
      toast.error('حدث خطأ أثناء إضافة الطلب: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    if (isSaving) return;
    
    queryClient.setQueryData(['custom_orders', userId, kanbanPage], (prev: any[]) => prev?.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

    try {
      const { error } = await supabase.from('custom_orders').update({ status: newStatus }).eq('id', orderId);
      if (error) {
        fetchData(false);
        throw error;
      }
      toast.success('تم تحديث حالة الطلب بنجاح');
      fetchData(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(`حدث خطأ أثناء تحديث الحالة: ${error?.message || JSON.stringify(error)}`);
    }
  };

  const handleEditOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Check if it's internal production (customer_id is null)
      if (!editingOrder.customer_id) {
        const { error } = await supabase.rpc('update_internal_production_v3', {
          p_order_id: editingOrder.id,
          p_new_product_id: editOrderForm.product_id,
          p_new_target_product_id: editOrderForm.target_product_id || null,
          p_new_fabric_meters_per_unit: parseArabicNumber(editOrderForm.fabric_meters),
          p_new_quantity: parseArabicNumber(editOrderForm.quantity || '1'),
          p_new_tailor_id: editOrderForm.tailor_id || null,
          p_new_tailoring_cost_per_unit: parseArabicNumber(editOrderForm.tailoring_cost),
          p_new_notes: editOrderForm.notes
        });
        if (error) throw error;
      } else {
        // Regular Order Edit
        const quantity = Math.max(1, parseInt(editOrderForm.quantity) || 1);
        const totalFabricMeters = parseArabicNumber(editOrderForm.fabric_meters) * quantity;
        const totalTailoringCost = parseArabicNumber(editOrderForm.tailoring_cost) * quantity;
        const orderTotalPrice = parseArabicNumber(editOrderForm.total_price);
        
        const metaNotes = JSON.stringify({
          notes: editOrderForm.notes,
          quantity: quantity,
          meters_per_unit: parseArabicNumber(editOrderForm.fabric_meters)
        });
        
        const { error } = await supabase.rpc('update_custom_order_v3', {
          p_order_id: editingOrder.id,
          p_new_customer_id: editOrderForm.customer_id || null,
          p_new_product_id: editOrderForm.product_id,
          p_new_target_product_id: editOrderForm.target_product_id || null,
          p_new_fabric_meters: totalFabricMeters,
          p_new_tailor_id: editOrderForm.tailor_id,
          p_new_tailoring_cost: totalTailoringCost,
          p_new_total_price: orderTotalPrice,
          p_new_advance_payment: parseArabicNumber(editOrderForm.advance_payment),
          p_new_advance_payment_method: editOrderForm.advance_payment_method,
          p_new_expected_delivery_date: editOrderForm.expected_delivery_date || null,
          p_new_notes: metaNotes,
          p_new_quantity: quantity
        });

        if (error) throw error;
      }

      setIsEditModalOpen(false);
      toast.success('تم حفظ التعديلات بنجاح');
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error('حدث خطأ أثناء حفظ التعديلات: ' + (error.message || 'خطأ غير معروف'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAndReverseOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    setConfirmDialog({
      isOpen: true,
      message: 'هل أنت متأكد من حذف وإلغاء هذا الطلب نهائياً؟ سيتم إرجاع القماش للمخزون، وإلغاء الديون، ومسح جميع السجلات المرتبطة.',
      onConfirm: async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
          // Check if it's internal production
          if (order && !order.customer_id) {
            const { error } = await supabase.rpc('delete_internal_production_v2', { p_order_id: orderId });
            if (error) throw error;
          } else {
            const { error } = await supabase.rpc('delete_custom_order_v2', { p_order_id: orderId });
            if (error) throw error;
          }
          fetchData();
          queryClient.invalidateQueries({ queryKey: ['products'] });
          toast.success('تم حذف الطلب بنجاح');
        } catch (error: any) {
          console.error('Error deleting and reversing order:', error);
        } finally {
          setIsSaving(false);
          setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} });
        }
      }
    });
  };

  const handleSaveInternalProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user?.id;

      const { error } = await supabase.rpc('create_internal_production_v3', {
        p_product_id: internalProduction.product_id,
        p_target_product_id: internalProduction.target_product_id || null,
        p_fabric_meters_per_unit: parseArabicNumber(internalProduction.fabric_meters),
        p_quantity: parseArabicNumber(internalProduction.quantity),
        p_tailor_id: internalProduction.tailor_id || null,
        p_tailoring_cost_per_unit: parseArabicNumber(internalProduction.tailoring_cost),
        p_date: internalProduction.date,
        p_notes: internalProduction.notes,
        p_tenant_id: tenantId
      });

      if (error) throw error;

      setInternalProduction({
        product_id: '', fabric_meters: '', target_product_id: '', quantity: '1', tailor_id: '', tailoring_cost: '', date: new Date().toISOString().split('T')[0], notes: ''
      });
      setIsInternalProductionModalOpen(false);
      toast.success('تم تسجيل عملية الإنتاج بنجاح');
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (error: any) {
      console.error('Error adding internal production:', error);
      toast.error('حدث خطأ أثناء تسجيل الإنتاج: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchTailorHistory = async (tailorId: string) => {
    setIsLoadingHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      if (tenantIdData) user.id = tenantIdData;

      let operationsRes = await supabase
        .from('custom_order_items')
        .select(`
          id, created_at, tailoring_cost, fabric_meters, notes, product_id, target_product_id,
          custom_orders ( id, customer_id, customers (name) ),
          fabric:products!custom_order_items_product_id_fkey (name),
          target:products!custom_order_items_target_product_id_fkey (name)
        `)
        .eq('tailor_id', tailorId)
        .eq('tenant_id', user.id);

      if (operationsRes.error) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('custom_order_items')
          .select(`
            id, created_at, tailoring_cost, fabric_meters, notes, product_id,
            custom_orders ( id, customer_id, customers (name) )
          `)
          .eq('tailor_id', tailorId)
          .eq('tenant_id', user.id);
          
        if (fallbackError) throw fallbackError;

        const { data: allProducts } = await supabase.from('products').select('id, name').eq('tenant_id', user.id);
        const productsMap = new Map(allProducts?.map(p => [p.id, p]) || []);
        
        if (fallbackData) {
          (operationsRes as any).data = fallbackData.map(op => ({
            ...op,
            fabric: productsMap.get(op.product_id) || { name: 'قماش غير محدد' },
            target: (op as any).target_product_id ? productsMap.get((op as any).target_product_id) : null
          }));
        }
      }

      const { data: payments } = await supabase
        .from('tailor_payments')
        .select(`
          id, created_at, payment_date, amount, reference_note
        `)
        .eq('tailor_id', tailorId)
        .eq('tenant_id', user.id);

      const history = [
        ...(operationsRes.data || []).map(op => ({
          type: 'operation',
          id: op.id,
          date: op.created_at,
          amount: op.tailoring_cost,
          fabric_meters: op.fabric_meters,
          product_id: op.product_id,
          target_product_id: op.target_product_id,
          notes: op.notes,
          customer_name: (op.custom_orders as any)?.[0]?.customers?.[0]?.name || 'عملية داخلية',
          fabric_name: (op.fabric as any)?.[0]?.name || 'قماش غير محدد',
          target_name: (op.target as any)?.[0]?.name || 'منتج تفصيل',
          original_data: op
        })),
        ...(payments || []).map(p => ({
          type: 'payment',
          id: p.id,
          date: p.payment_date || p.created_at,
          amount: p.amount,
          reference_note: p.reference_note,
          original_data: p
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTailorHistory(history);
    } catch (error) {
      console.error('Error fetching tailor history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const oldAmount = parseArabicNumber(editingPayment.original_data.amount);
      const newAmount = parseArabicNumber(editPaymentForm.amount);
      const diff = newAmount - oldAmount;

      await supabase.from('tailor_payments').update({
        amount: newAmount,
        payment_date: editPaymentForm.date,
        reference_note: editPaymentForm.note
      }).eq('id', editingPayment.id);

      const { data: tailor } = await supabase.from('tailors').select('balance').eq('id', selectedTailor.id).single();
      if (tailor) {
        await supabase.from('tailors').update({ balance: tailor.balance - diff }).eq('id', selectedTailor.id);
      }

      await supabase.from('transactions').update({
        amount: newAmount,
        date: editPaymentForm.date,
        description: `دفعة للخياط: ${selectedTailor.name}${editPaymentForm.note ? ' - ' + editPaymentForm.note : ''}`
      }).eq('reference_type', 'tailor_payment').eq('reference_id', editingPayment.id);

      setEditingPayment(null);
      fetchTailorHistory(selectedTailor.id);
      fetchData();
    } catch (error) {
      console.error('Error updating payment:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const oldCost = parseArabicNumber(editingOperation.original_data.tailoring_cost);
      const newCost = parseArabicNumber(editOperationForm.tailoring_cost);
      const costDiff = newCost - oldCost;

      const oldFabric = parseArabicNumber(editingOperation.original_data.fabric_meters);
      const newFabric = parseArabicNumber(editOperationForm.fabric_meters);
      const fabricDiff = newFabric - oldFabric;

      await supabase.from('custom_order_items').update({
        tailoring_cost: newCost,
        fabric_meters: newFabric
      }).eq('id', editingOperation.id);

      const { data: tailor } = await supabase.from('tailors').select('balance').eq('id', selectedTailor.id).single();
      if (tailor) {
        await supabase.from('tailors').update({ balance: tailor.balance + costDiff }).eq('id', selectedTailor.id);
      }

      const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', editingOperation.product_id).single();
      if (product) {
        await supabase.from('products').update({ stock_quantity: product.stock_quantity - fabricDiff }).eq('id', editingOperation.product_id);
      }

      setEditingOperation(null);
      fetchTailorHistory(selectedTailor.id);
      fetchData();
    } catch (error) {
      console.error('Error updating operation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const openWhatsApp = (phone: string, customerName: string, remaining: number) => {
    const message = `مرحباً ${customerName}، دراعتك جاهزة للاستلام! المبلغ المتبقي هو ${remaining} ${settings.currency}.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleUpdateReceivedQuantity = async (orderId: string, itemId: string, newReceivedQty: number, metaNotes: any) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    const updatedNotes = {
      ...metaNotes,
      received_quantity: newReceivedQty
    };
    
    // Optimistic update
    queryClient.setQueryData(['custom_orders', userId, kanbanPage], (prev: any[]) => prev?.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          custom_order_items: o.custom_order_items?.map((item: any) => 
            item.id === itemId 
              ? { ...item, notes: JSON.stringify(updatedNotes) }
              : item
          )
        };
      }
      return o;
    }));

    try {
      const { error } = await supabase
        .from('custom_order_items')
        .update({ notes: JSON.stringify(updatedNotes) })
        .eq('id', itemId);
      
      if (error) {
        fetchData(false);
        throw error;
      };
      // We don't necessarily need an explicit refresh here since we handled it in state,
      // but let's do a background sync just in case
      fetchData(false);
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء تحديث الكمية');
    }
  };

  const renderKanbanColumn = (status: string, title: string, colorClass: string) => {
    const columnOrders = orders.filter(o => o.status === status);
    
    return (
      <div className="flex flex-col bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 min-w-[300px] max-w-[350px] flex-1 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className={cn("font-bold text-sm px-3 py-1 rounded-full", colorClass)}>
            {title}
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-white dark:bg-gray-800 px-2 py-1 rounded-lg shadow-sm">
            {columnOrders.length}
          </span>
        </div>
        
        <div className="flex flex-col gap-3 overflow-y-auto pb-2">
          {columnOrders.slice(0, visibleCount[status] || 10).map(order => (
            <OrderCard
              key={order.id}
              order={order}
              status={status}
              settings={settings}
              onUpdateReceivedQuantity={handleUpdateReceivedQuantity}
              onEdit={(order) => {
                const item = order.custom_order_items?.[0];
                let meta: any = {};
                try {
                  if (item?.notes && item.notes.startsWith('{')) {
                    meta = JSON.parse(item.notes);
                  }
                } catch(e) {}

                setEditingOrder(order);
                setEditOrderForm({
                  customer_id: order.customer_id || '',
                  total_price: order.total_price.toString(),
                  advance_payment: order.advance_payment.toString(),
                  advance_payment_method: 'cash',
                  expected_delivery_date: order.expected_delivery_date || '',
                  notes: meta.notes !== undefined ? meta.notes : (item?.notes && !item.notes.startsWith('{') ? item.notes : ''),
                  product_id: item?.product_id || '',
                  target_product_id: item?.target_product_id || '',
                  fabric_meters: meta.meters_per_unit || item?.fabric_meters?.toString() || '',
                  tailor_id: item?.tailor_id || '',
                  tailoring_cost: item?.tailoring_cost?.toString() || '',
                  quantity: meta.quantity || '1'
                });
                setIsEditModalOpen(true);
              }}
              onDelete={(id) => setConfirmDialog({
                isOpen: true,
                message: 'هل أنت متأكد من حذف هذا الطلب؟',
                onConfirm: () => handleDeleteAndReverseOrder(id)
              })}
              onUpdateStatus={updateOrderStatus}
              onWhatsApp={openWhatsApp}
            />
          ))}
          
          {columnOrders.length > (visibleCount[status] || 10) && (
            <button
              onClick={() => loadMoreCards(status)}
              className="w-full py-2.5 mt-2 bg-white dark:bg-gray-800 text-brand-primary font-bold text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors shadow-sm"
            >
              عرض المزيد ({columnOrders.length - (visibleCount[status] || 10)} متبقي)
            </button>
          )}

          {columnOrders.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500 font-medium border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              لا توجد طلبات
            </div>
          )}
        </div>
      </div>
    );
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الإنتاج والطلبات</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">إدارة عمليات التصنيع والطلبات الخاصة.</p>
        </div>
        <button
          onClick={() => setIsInternalProductionModalOpen(true)}
          className="bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm shadow-brand-primary/20 flex items-center gap-2"
        >
          <Scissors className="w-5 h-5" />
          <span>إنتاج داخلي</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 space-x-reverse border-b border-gray-200 dark:border-gray-800 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setActiveTab('board')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap",
            activeTab === 'board' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Kanban className="w-4 h-4" />
          لوحة المتابعة
        </button>
        <button
          onClick={() => setActiveTab('new')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap",
            activeTab === 'new' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Plus className="w-4 h-4" />
          طلب جديد
        </button>
        <button
          onClick={() => setActiveTab('tailors')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap",
            activeTab === 'tailors' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Users className="w-4 h-4" />
          الفنيين / المنتجين
        </button>
      </div>

      {/* Tab Content: Kanban Board */}
      {activeTab === 'board' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4 overflow-x-auto pb-4 items-start">
            {renderKanbanColumn('pending', 'طلبات جديدة', 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300')}
            {renderKanbanColumn('tailoring', 'عند الخياط', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400')}
            {renderKanbanColumn('ready', 'جاهز للاستلام', 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400')}
            {renderKanbanColumn('delivered', 'تم التسليم (إنتاج داخلي)', 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400')}
          </div>
          {orders.length >= kanbanPage * 100 && (
            <div className="flex justify-center mt-2">
              <button 
                onClick={() => setKanbanPage(prev => prev + 1)}
                className="bg-white dark:bg-gray-800 text-brand-primary border border-gray-200 dark:border-gray-700 px-6 py-2.5 rounded-xl font-bold shadow-sm hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors"
              >
                تحميل طلبات أقدم...
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: New Order */}
      {activeTab === 'new' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 max-w-4xl">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">إضافة طلب تفصيل جديد</h2>
          <form onSubmit={handleAddOrder} className="space-y-6 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer & Product */}
              <div className="space-y-4">
                <h3 className="font-bold text-brand-primary border-b border-gray-100 dark:border-gray-700 pb-2">بيانات العميل والقماش</h3>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">العميل</label>
                  <SearchableSelect 
                    required 
                    value={newOrder.customer_id} 
                    onChange={val => setNewOrder({...newOrder, customer_id: val})} 
                    options={[{value: '', label: 'اختر العميل...'}, ...customers.filter((c: any) => c.is_active !== false && !c.is_archived).map(c => ({ value: c.id, label: c.name, subtitle: c.phone }))]}
                    placeholder="ابحث عن عميل..."
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">القماش (الخنط)</label>
                  <SearchableSelect 
                    required 
                    value={newOrder.product_id} 
                    onChange={val => setNewOrder({...newOrder, product_id: val})} 
                    options={products
                      .filter(p => p.category === 'قماش' || (p.category !== 'قماش' && p.category !== 'دراعة' && p.category !== 'ملابس جاهزة' && p.category !== 'أحذية' && p.category !== 'أخرى'))
                      .map(p => ({ value: p.id, label: p.name, subtitle: `المتوفر: ${p.stock_quantity} ${p.unit || 'قطعة'}` }))}
                    placeholder="اختر القماش..."
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المنتج المستهدف (الجاهز)</label>
                  <SearchableSelect 
                    value={newOrder.target_product_id} 
                    onChange={val => setNewOrder({...newOrder, target_product_id: val})} 
                    options={products
                      .filter(p => p.category === 'دراعة' || (p.category !== 'قماش' && p.category !== 'دراعة' && p.category !== 'ملابس جاهزة' && p.category !== 'أحذية' && p.category !== 'أخرى'))
                      .map(p => ({ value: p.id, label: p.name }))}
                    placeholder="اختر المنتج الجاهز (اختياري)..."
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الكمية (عدد القطع)</label>
                  <input type="number" required min="1" value={newOrder.quantity} onChange={e => setNewOrder({...newOrder, quantity: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">عدد الأمتار المستهلكة (للقطعة الواحدة)</label>
                  <input type="number" required min="0.1" step="0.1" value={newOrder.fabric_meters} onChange={e => setNewOrder({...newOrder, fabric_meters: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" placeholder="مثال: 7" />
                </div>
              </div>

              {/* Tailor & Finance */}
              <div className="space-y-4">
                <h3 className="font-bold text-brand-primary border-b border-gray-100 dark:border-gray-700 pb-2">بيانات الخياطة والمالية</h3>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الخياط</label>
                  <SearchableSelect 
                    required 
                    value={newOrder.tailor_id} 
                    onChange={val => setNewOrder({...newOrder, tailor_id: val})} 
                    options={[{value: '', label: 'اختر الخياط...'}, ...tailors.map(t => ({ value: t.id, label: t.name }))]}
                    placeholder="ابحث عن خياط..."
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تكلفة الخياطة للقطعة (أجرة الخياط)</label>
                  <input type="number" required min="0" value={newOrder.tailoring_cost} onChange={e => setNewOrder({...newOrder, tailoring_cost: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" placeholder="0" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">السعر الإجمالي للطلب</label>
                    <input type="number" required min="0" value={newOrder.total_price} onChange={e => setNewOrder({...newOrder, total_price: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-brand-primary" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الدفعة الأولية</label>
                    <input type="number" required min="0" value={newOrder.advance_payment} onChange={e => setNewOrder({...newOrder, advance_payment: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-green-600" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع</label>
                    <select value={newOrder.advance_payment_method} onChange={e => setNewOrder({...newOrder, advance_payment_method: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none">
                      {paymentMethodsList.map(method => (
                        <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ التسليم المتوقع</label>
                <input type="date" value={newOrder.expected_delivery_date} onChange={e => setNewOrder({...newOrder, expected_delivery_date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظات (المقاسات والتفاصيل)</label>
                <textarea value={newOrder.notes} onChange={e => setNewOrder({...newOrder, notes: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none resize-none" rows={3} placeholder="سجل مقاسات العميل وتفاصيل الخياطة هنا..."></textarea>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button 
                type="submit" 
                disabled={isSaving}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ الطلب'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab Content: Tailors */}
      {activeTab === 'tailors' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={() => setIsAddTailorModalOpen(true)} className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl hover:bg-brand-primary/90 transition-colors font-bold text-sm shadow-sm">
              <Plus className="w-4 h-4" />
              إضافة خياط
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">سجل الخياطين</h3>
              <button
                onClick={() => exportTableToPDF('tailors-table', 'سجل_الخياطين')}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>تحميل PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="tailors-table" className="w-full text-right">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-sm">
                  <tr>
                    <th className="px-6 py-4 font-bold">اسم الخياط</th>
                    <th className="px-6 py-4 font-bold">رقم الهاتف</th>
                    <th className="px-6 py-4 font-bold">الرصيد المستحق (له)</th>
                    <th className="px-6 py-4 font-bold text-left">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {tailors.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-medium">
                        لا يوجد خياطين مسجلين
                      </td>
                    </tr>
                  ) : (
                    tailors.map(tailor => (
                      <tr 
                        key={tailor.id} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedTailor(tailor);
                          setIsTailorHistoryModalOpen(true);
                          fetchTailorHistory(tailor.id);
                        }}
                      >
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          {tailor.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                          {tailor.phone || '-'}
                        </td>
                        <td className="px-6 py-4 font-black text-red-600 dark:text-red-400">
                          {Number(tailor.balance).toLocaleString()} {settings.currency}
                        </td>
                        <td className="px-6 py-4 text-left">
                          <div className="flex items-center gap-2 justify-end">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPayTailorForm({ ...payTailorForm, tailor_id: tailor.id });
                                setIsPayTailorModalOpen(true);
                              }}
                              className="bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                            >
                              تسديد دفعة
                            </button>
                            {tailor.phone && (
                              <a
                                href={`https://wa.me/${tailor.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
                                title="تواصل عبر واتساب"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Tailor Modal */}
      {isAddTailorModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">إضافة خياط جديد</h2>
            </div>
            <form onSubmit={handleAddTailor} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم الخياط</label>
                <input type="text" required value={newTailor.name} onChange={e => setNewTailor({...newTailor, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رقم الهاتف</label>
                <input type="tel" value={newTailor.phone} onChange={e => setNewTailor({...newTailor, phone: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" dir="ltr" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSaving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ'}
                </button>
                <button type="button" onClick={() => setIsAddTailorModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Tailor Modal */}
      {isPayTailorModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تسديد دفعة للخياط</h2>
            </div>
            <form onSubmit={handlePayTailor} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ ({settings.currency})</label>
                <input type="number" required min="1" value={payTailorForm.amount} onChange={e => setPayTailorForm({...payTailorForm, amount: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-lg" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">التاريخ</label>
                <input type="date" required value={payTailorForm.date} onChange={e => setPayTailorForm({...payTailorForm, date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظة / مرجع</label>
                <input type="text" value={payTailorForm.reference_note} onChange={e => setPayTailorForm({...payTailorForm, reference_note: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" placeholder="مثال: دفعة عن شهر كذا..." />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع</label>
                <select value={payTailorForm.payment_method} onChange={e => setPayTailorForm({...payTailorForm, payment_method: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none">
                  {paymentMethodsList.map(method => (
                    <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSaving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تسديد'}
                </button>
                <button type="button" onClick={() => setIsPayTailorModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Internal Production Modal */}
      {isInternalProductionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تسجيل عملية إنتاج داخلية</h2>
              <button onClick={() => setIsInternalProductionModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSaveInternalProduction} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المادة الخام المستخدمة</label>
                  <SearchableSelect 
                    required 
                    value={internalProduction.product_id} 
                    onChange={val => setInternalProduction({...internalProduction, product_id: val})} 
                    options={products.map(p => ({ value: p.id, label: p.name, subtitle: `المتوفر: ${p.stock_quantity} ${p.unit || 'قطعة'}` }))}
                    placeholder="اختر المادة الخام..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">أمتار الخام للقطعة الواحدة</label>
                  <input type="number" step="0.1" required min="0.1" value={internalProduction.fabric_meters} onChange={e => setInternalProduction({...internalProduction, fabric_meters: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المنتج النهائي</label>
                  <SearchableSelect 
                    required 
                    value={internalProduction.target_product_id} 
                    onChange={val => setInternalProduction({...internalProduction, target_product_id: val})} 
                    options={products.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="اختر المنتج..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الكمية المنتجة</label>
                  <input type="number" required min="1" value={internalProduction.quantity} onChange={e => setInternalProduction({...internalProduction, quantity: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الفني / المنتج المسئول</label>
                  <SearchableSelect 
                    required={Number(internalProduction.tailoring_cost || 0) > 0} 
                    value={internalProduction.tailor_id} 
                    onChange={val => setInternalProduction({...internalProduction, tailor_id: val})} 
                    options={[{value: '', label: 'اختر الشخص (اختياري)...'}, ...tailors.map(t => ({ value: t.id, label: t.name }))]}
                    placeholder="ابحث عن الشخص..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">أجرة الخياط للقطعة الواحدة ({settings.currency})</label>
                  <input type="number" min="0" value={internalProduction.tailoring_cost} onChange={e => setInternalProduction({...internalProduction, tailoring_cost: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ العملية</label>
                  <input type="date" required value={internalProduction.date} onChange={e => setInternalProduction({...internalProduction, date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظات</label>
                  <textarea value={internalProduction.notes} onChange={e => setInternalProduction({...internalProduction, notes: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none resize-none" rows={3} placeholder="تفاصيل إضافية..." />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={isSaving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ العملية'}
                </button>
                <button type="button" onClick={() => setIsInternalProductionModalOpen(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tailor History Modal */}
      {isTailorHistoryModalOpen && selectedTailor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">سجل الخياط: {selectedTailor.name}</h2>
                <p className="text-sm text-gray-500 mt-1">الرصيد الحالي: <span className="font-bold text-red-500">{Number(selectedTailor.balance).toLocaleString()} {settings.currency}</span></p>
              </div>
              <button onClick={() => setIsTailorHistoryModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingHistory ? (
                <div className="flex justify-center items-center h-32">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {tailorHistory.map((item, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("text-xs font-bold px-2 py-1 rounded-md", item.type === 'payment' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400')}>
                            {item.type === 'payment' ? 'دفعة مسددة' : 'عملية خياطة'}
                          </span>
                          <span className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                        </div>
                        {item.type === 'operation' ? (
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>العميل:</strong> {item.customer_name} | <strong>القماش:</strong> {item.fabric_name} ({item.fabric_meters}م) | <strong>المنتج:</strong> {item.target_name}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>ملاحظة:</strong> {item.reference_note || 'لا توجد'}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={cn("font-bold", item.type === 'payment' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {item.type === 'payment' ? '-' : '+'}{Number(item.amount).toLocaleString()} {settings.currency}
                        </span>
                        <button 
                          onClick={() => {
                            if (item.type === 'payment') {
                              setEditingPayment(item);
                              setEditPaymentForm({ amount: item.amount, date: new Date(item.date).toISOString().split('T')[0], note: item.reference_note || '' });
                            } else {
                              setEditingOperation(item);
                              setEditOperationForm({ tailoring_cost: item.amount, fabric_meters: item.fabric_meters });
                            }
                          }}
                          className="text-sm text-brand-primary hover:underline"
                        >
                          تعديل
                        </button>
                      </div>
                    </div>
                  ))}
                  {tailorHistory.length === 0 && (
                    <div className="text-center text-gray-500 py-8">لا يوجد سجل لهذا الخياط</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تعديل دفعة</h2>
            </div>
            <form onSubmit={handleUpdatePayment} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ ({settings.currency})</label>
                <input type="number" required min="1" value={editPaymentForm.amount} onChange={e => setEditPaymentForm({...editPaymentForm, amount: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-lg" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">التاريخ</label>
                <input type="date" required value={editPaymentForm.date} onChange={e => setEditPaymentForm({...editPaymentForm, date: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظة</label>
                <input type="text" value={editPaymentForm.note} onChange={e => setEditPaymentForm({...editPaymentForm, note: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSaving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التعديل'}
                </button>
                <button type="button" onClick={() => setEditingPayment(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Operation Modal */}
      {editingOperation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تعديل عملية خياطة</h2>
            </div>
            <form onSubmit={handleUpdateOperation} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">أجرة الخياط ({settings.currency})</label>
                <input type="number" required min="0" value={editOperationForm.tailoring_cost} onChange={e => setEditOperationForm({...editOperationForm, tailoring_cost: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none font-bold text-lg" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">أمتار القماش</label>
                <input type="number" step="0.1" required min="0.1" value={editOperationForm.fabric_meters} onChange={e => setEditOperationForm({...editOperationForm, fabric_meters: e.target.value})} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSaving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ التعديل'}
                </button>
                <button type="button" onClick={() => setEditingOperation(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Pay Remaining Modal */}
      {/* Edit Order Modal */}
      {isEditModalOpen && editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">تعديل الطلب</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleEditOrder} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {editingOrder.customer_id && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">العميل</label>
                    <SearchableSelect 
                      required 
                      value={editOrderForm.customer_id} 
                      onChange={val => setEditOrderForm({...editOrderForm, customer_id: val})} 
                      options={[{value: '', label: 'اختر العميل...'}, ...customers.filter((c: any) => (c.is_active !== false && !c.is_archived) || c.id === editOrderForm.customer_id).map(c => ({ value: c.id, label: c.name, subtitle: c.phone }))]}
                      placeholder="ابحث عن عميل..."
                      className="bg-gray-50 dark:bg-gray-800"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المادة الخام (القماش)</label>
                  <SearchableSelect 
                    required 
                    value={editOrderForm.product_id} 
                    onChange={val => setEditOrderForm({...editOrderForm, product_id: val})} 
                    options={products.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="اختر القماش..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المنتج النهائي</label>
                  <SearchableSelect 
                    value={editOrderForm.target_product_id || ''} 
                    onChange={val => setEditOrderForm({...editOrderForm, target_product_id: val})} 
                    options={products.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="اختر المنتج..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الكمية المنتجة (عدد القطع)</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    value={editOrderForm.quantity} 
                    onChange={e => setEditOrderForm({...editOrderForm, quantity: e.target.value})} 
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                    {!editingOrder.customer_id ? 'أمتار الخام للقطعة الواحدة' : 'أمتار القماش للقطعة الواحدة'}
                  </label>
                  <input 
                    type="number" 
                    step="0.1" 
                    required 
                    value={editOrderForm.fabric_meters} 
                    onChange={e => setEditOrderForm({...editOrderForm, fabric_meters: e.target.value})} 
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الخياط</label>
                  <SearchableSelect 
                    required={!!editingOrder.customer_id || Number(editOrderForm.tailoring_cost || 0) > 0} 
                    value={editOrderForm.tailor_id || ''} 
                    onChange={val => setEditOrderForm({...editOrderForm, tailor_id: val})} 
                    options={[{value: '', label: editingOrder.customer_id ? 'اختر الخياط...' : 'اختر الخياط (اختياري)...'}, ...tailors.map(t => ({ value: t.id, label: t.name }))]}
                    placeholder="ابحث عن خياط..."
                    className="bg-gray-50 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">أجرة الخياط للقطعة الواحدة</label>
                  <input 
                    type="number" 
                    required={!!editingOrder.customer_id}
                    min="0"
                    value={editOrderForm.tailoring_cost} 
                    onChange={e => setEditOrderForm({...editOrderForm, tailoring_cost: e.target.value})} 
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                {editingOrder.customer_id && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">إجمالي السعر للعميل</label>
                      <input 
                        type="number" 
                        required 
                        value={editOrderForm.total_price} 
                        onChange={e => setEditOrderForm({...editOrderForm, total_price: e.target.value})} 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الدفعة المقدمة</label>
                      <input 
                        type="number" 
                        required 
                        value={editOrderForm.advance_payment} 
                        onChange={e => setEditOrderForm({...editOrderForm, advance_payment: e.target.value})} 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع</label>
                      <select 
                        value={editOrderForm.advance_payment_method} 
                        onChange={e => setEditOrderForm({...editOrderForm, advance_payment_method: e.target.value})} 
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                      >
                        {paymentMethodsList.map(method => (
                          <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ التسليم المتوقع</label>
                  <input 
                    type="date" 
                    value={editOrderForm.expected_delivery_date} 
                    onChange={e => setEditOrderForm({...editOrderForm, expected_delivery_date: e.target.value})} 
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظات</label>
                  <textarea 
                    value={editOrderForm.notes} 
                    onChange={e => setEditOrderForm({...editOrderForm, notes: e.target.value})} 
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none md:col-span-2"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 bg-brand-primary text-white py-4 rounded-xl font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 text-lg shadow-lg"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
                <button 
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditModalOpen(false);
                    handleDeleteAndReverseOrder(editingOrder.id);
                  }}
                  className="px-6 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-xl font-bold transition-colors border border-red-100 dark:border-red-900/30"
                >
                  حذف وإلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">تأكيد الإجراء</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={confirmDialog.onConfirm}
                disabled={isSaving}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تأكيد'}
              </button>
              <button
                onClick={() => setConfirmDialog({ isOpen: false, message: '', onConfirm: () => {} })}
                disabled={isSaving}
                className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
