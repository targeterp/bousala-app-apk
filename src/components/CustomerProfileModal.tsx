import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Phone, MessageCircle, Edit2, Trash2, ShoppingCart, 
  DollarSign, FileText, Scissors, ChevronDown, ChevronUp, 
  Loader2, Check, AlertCircle, ArrowDown, ArrowUp,
  Archive, RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { cn } from '../utils';
import toast from 'react-hot-toast';

export type CustomerSaleItem = {
  id: string;
  product_id?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_name?: string;
  product_unit?: string;
  products?: {
    id: string;
    name: string;
    unit?: string;
  } | null;
};

export type CustomerSale = {
  id: string;
  created_at: string;
  subtotal?: number;
  discount?: number;
  total_amount: number;
  paid_amount: number;
  payment_method?: string;
  status?: string;
  sale_items?: CustomerSaleItem[];
};

export type CustomerTransaction = {
  id: string;
  date: string;
  created_at?: string;
  type: string;
  amount: number;
  reference_type?: string;
  reference_id?: string;
  description?: string;
  payment_method?: string;
};

export type CustomerOrder = {
  id: string;
  created_at: string;
  order_date?: string;
  total_price: number;
  paid_amount?: number;
  advance_payment?: number;
  status: string;
  custom_order_items?: any[];
};

export type CustomerProfileModalProps = {
  customer: any | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdated?: () => void;
  onEditCustomer?: (customer: any) => void;
  onDeleteCustomer?: (customerId: string) => void;
  onArchiveCustomer?: (customerId: string, archive: boolean) => Promise<void> | void;
  settings: {
    currency?: string;
    [key: string]: any;
  };
  paymentMethodsList?: any[];
  isExpired?: boolean;
  setShowRenewModal?: (show: boolean) => void;
};

// Format date and time in Arabic format matching the design:
// e.g. "29 أبريل 2026 في 8:49 م"
const formatArabicDateTime = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const day = d.getDate();
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${day} ${month} ${year} في ${hours}:${minutes} ${ampm}`;
};

export function CustomerProfileModal({
  customer,
  isOpen,
  onClose,
  onCustomerUpdated,
  onEditCustomer,
  onDeleteCustomer,
  onArchiveCustomer,
  settings,
  paymentMethodsList = [],
  isExpired = false,
  setShowRenewModal
}: CustomerProfileModalProps) {
  const currency = settings.currency || 'MRU';

  const [isLoading, setIsLoading] = useState(false);
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [freshCustomer, setFreshCustomer] = useState<any>(null);

  // Archive confirmation modal state
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Header collapse / drag state
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const dragStartYRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Payment / Debt action state
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payDescription, setPayDescription] = useState('');
  const [payMethod, setPayMethod] = useState(paymentMethodsList[0]?.method_id || 'cash');
  const [payDirection, setPayDirection] = useState<'pay' | 'refund'>('pay');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  // Editing receipt/voucher state
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxDescription, setEditTxDescription] = useState('');
  const [editTxPaymentMethod, setEditTxPaymentMethod] = useState('cash');
  const [isSubmittingEditTx, setIsSubmittingEditTx] = useState(false);
  const [isDeletingTx, setIsDeletingTx] = useState(false);

  // Reset states when customer changes
  useEffect(() => {
    setFreshCustomer(null);
    setIsHeaderCollapsed(false);
    setShowPayForm(false);
    setEditingTx(null);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayDescription('');
  }, [customer?.id]);

  // Unified active customer object
  const activeCustomer = useMemo(() => {
    if (!customer) return null;
    return {
      ...customer,
      ...(freshCustomer || {}),
      debt: Number(freshCustomer?.balance ?? freshCustomer?.debt ?? customer?.debt ?? customer?.balance ?? 0),
      balance: Number(freshCustomer?.balance ?? customer?.balance ?? 0),
      opening_balance: Number(freshCustomer?.opening_balance ?? customer?.opening_balance ?? 0),
      is_active: freshCustomer?.is_active !== undefined ? freshCustomer.is_active : customer?.is_active,
      is_archived: freshCustomer?.is_archived !== undefined ? freshCustomer.is_archived : customer?.is_archived
    };
  }, [customer, freshCustomer]);

  const isCustomerArchived = activeCustomer?.is_active === false || activeCustomer?.is_archived === true;

  // Load Customer Detailed Data (Sales, Transactions, Custom Orders)
  const loadCustomerDetails = async () => {
    if (!customer?.id) return;
    setIsLoading(true);

    try {
      // 1. Fast local load from Dexie
      try {
        const localSales = await db.sales.where({ customer_id: customer.id }).reverse().sortBy('created_at');
        const localTx = await db.transactions
          .filter(t => t.reference_id === customer.id || t.entity_id === customer.id)
          .toArray();

        const enrichedLocalSales: CustomerSale[] = await Promise.all(
          localSales.map(async (s: any) => {
            const items = await db.sale_items.where({ sale_id: s.id }).toArray();
            const enrichedItems = await Promise.all(
              items.map(async (it) => {
                const prod = await db.products.get(it.product_id);
                return {
                  ...it,
                  product_name: prod?.name || 'صنف غير محدد',
                  product_unit: prod?.unit || 'قطعة'
                };
              })
            );
            return {
              ...s,
              sale_items: enrichedItems
            };
          })
        );

        setSales(enrichedLocalSales);
        setTransactions(localTx as CustomerTransaction[]);
      } catch (localErr) {
        console.warn('Local DB lookup note:', localErr);
      }

      // 2. Fetch fresh online data from Supabase
      if (navigator.onLine) {
        const { data: sessionData } = await supabase.auth.getSession();
        const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
        const tenantId = tenantIdData || sessionData.session?.user.id;

        // Fetch sales
        const salesPromise = supabase
          .from('sales')
          .select(`
            id, subtotal, discount, total_amount, paid_amount, payment_method, status, created_at,
            sale_items (
              id, product_id, quantity, unit_price, total_price,
              products ( id, name, unit )
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false });

        // Fetch financial transactions
        const txPromise = supabase
          .from('transactions')
          .select('*')
          .eq('tenant_id', tenantId)
          .or(`entity_id.eq.${customer.id},reference_id.eq.${customer.id}`)
          .order('created_at', { ascending: false });

        // Fetch fresh customer details
        const custPromise = supabase
          .from('customers')
          .select('*')
          .eq('id', customer.id)
          .maybeSingle();

        // Fetch custom orders with fallback for relation naming
        const ordersPromise = (async () => {
          let ordersRes: any = await supabase
            .from('custom_orders')
            .select(`
              id, total_price, paid_amount, advance_payment, status, created_at, order_date,
              custom_order_items (
                id, fabric_meters, tailoring_cost, notes, quantity, product_id, target_product_id,
                fabric:products!custom_order_items_product_id_fkey (name),
                target:products!custom_order_items_target_product_id_fkey (name)
              )
            `)
            .eq('tenant_id', tenantId)
            .eq('customer_id', customer.id)
            .order('created_at', { ascending: false });

          if (ordersRes.error) {
            ordersRes = await supabase
              .from('custom_orders')
              .select(`
                id, total_price, paid_amount, advance_payment, status, created_at, order_date,
                custom_order_items (
                  id, fabric_meters, tailoring_cost, notes, quantity, product_id, target_product_id
                )
              `)
              .eq('tenant_id', tenantId)
              .eq('customer_id', customer.id)
              .order('created_at', { ascending: false });
          }
          return ordersRes;
        })();

        const [salesRes, txRes, ordersRes, freshCustRes] = await Promise.all([
          salesPromise,
          txPromise,
          ordersPromise,
          custPromise
        ]);

        if (freshCustRes.data) {
          setFreshCustomer(freshCustRes.data);
        }

        if (salesRes.data) {
          const formattedSales: CustomerSale[] = salesRes.data.map((sale: any) => ({
            ...sale,
            sale_items: (sale.sale_items || []).map((it: any) => ({
              ...it,
              product_name: it.products?.name || 'صنف',
              product_unit: it.products?.unit || 'قطعة'
            }))
          }));
          setSales(formattedSales);
        }

        if (txRes.data) {
          setTransactions(txRes.data as CustomerTransaction[]);
        }

        if (ordersRes.data) {
          // Resolve any missing fabric / target product names from local Dexie products cache
          const enrichedOrders: CustomerOrder[] = await Promise.all(
            ordersRes.data.map(async (ord: any) => {
              const items = await Promise.all(
                (ord.custom_order_items || []).map(async (it: any) => {
                  let fabricName = it.fabric?.name;
                  let targetName = it.target?.name;

                  if (!fabricName && it.product_id) {
                    const p = await db.products.get(it.product_id);
                    if (p) fabricName = p.name;
                  }
                  if (!targetName && it.target_product_id) {
                    const p = await db.products.get(it.target_product_id);
                    if (p) targetName = p.name;
                  }

                  return {
                    ...it,
                    fabric: { name: fabricName || 'قماش' },
                    target: { name: targetName || 'منتج تفصيل' }
                  };
                })
              );

              return {
                ...ord,
                custom_order_items: items
              };
            })
          );
          setOrders(enrichedOrders);
        }
      }
    } catch (err) {
      console.error('Error fetching customer details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && customer?.id) {
      loadCustomerDetails();
    }
  }, [isOpen, customer?.id, customer?.balance, customer?.opening_balance, customer?.name, customer?.phone]);

  // Handle debt payment or refund
  const handlePayDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired && setShowRenewModal) {
      setShowRenewModal(true);
      return;
    }

    const amount = Number(payAmount);
    if (!amount || amount <= 0 || isSubmittingPay) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmittingPay(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      const finalAmount = payDirection === 'pay' ? amount : -amount;
      const chosenDate = payDate || new Date().toISOString().split('T')[0];
      const chosenDateTime = new Date(chosenDate + 'T12:00:00Z').toISOString();

      let rpcDone = false;
      try {
        const { error } = await supabase.rpc('pay_customer_debt', {
          p_customer_id: activeCustomer?.id || customer?.id,
          p_amount: finalAmount,
          p_payment_method: payMethod,
          p_user_id: userId,
          p_order_id: selectedOrderId || null,
          p_date: chosenDate,
          p_description: payDescription.trim() || null
        });
        if (!error) rpcDone = true;
      } catch (e) {
        console.warn('pay_customer_debt with date/desc:', e);
      }

      if (!rpcDone) {
        const { error } = await supabase.rpc('pay_customer_debt', {
          p_customer_id: activeCustomer?.id || customer?.id,
          p_amount: finalAmount,
          p_payment_method: payMethod,
          p_user_id: userId,
          p_order_id: selectedOrderId || null
        });
        if (error) throw error;

        // Update date on the newly created transaction if needed
        if (chosenDate) {
          await supabase
            .from('transactions')
            .update({
              date: chosenDate,
              created_at: chosenDateTime,
              ...(payDescription.trim() ? { description: payDescription.trim() } : {})
            })
            .eq('entity_id', activeCustomer?.id || customer?.id)
            .order('created_at', { ascending: false })
            .limit(1);
        }
      }

      toast.success(payDirection === 'pay' ? 'تم تسجيل السداد بنجاح' : 'تم تسجيل الاسترداد بنجاح');
      setShowPayForm(false);
      setPayAmount('');
      setPayDescription('');
      setPayDate(new Date().toISOString().split('T')[0]);
      setSelectedOrderId('');

      await loadCustomerDetails();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      console.error('Error paying debt:', err);
      toast.error('حدث خطأ أثناء تسجيل المعاملة: ' + (err.message || ''));
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleOpenEditTx = (tx: any) => {
    setEditingTx(tx);
    setEditTxAmount(Number(tx.amount || 0).toString());
    const rawDate = tx.date || tx.created_at;
    setEditTxDate(rawDate ? new Date(rawDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setEditTxDescription(tx.description || '');
    setEditTxPaymentMethod(tx.payment_method || 'cash');
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const newAmount = Number(editTxAmount);
    if (!newAmount || newAmount <= 0 || isSubmittingEditTx) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmittingEditTx(true);
    try {
      const chosenDate = editTxDate || new Date().toISOString().split('T')[0];
      const chosenDateTime = new Date(chosenDate + 'T12:00:00Z').toISOString();

      // Try RPC first
      let rpcSucceeded = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('edit_customer_payment_transaction', {
          p_transaction_id: editingTx.id,
          p_new_amount: newAmount,
          p_new_date: chosenDate,
          p_new_description: editTxDescription.trim(),
          p_new_payment_method: editTxPaymentMethod
        });
        if (!rpcErr && rpcRes?.success) {
          rpcSucceeded = true;
        }
      } catch (err) {
        console.warn('RPC edit_customer_payment_transaction fallback:', err);
      }

      // Fallback: Direct database updates
      if (!rpcSucceeded) {
        const oldAmount = Number(editingTx.amount || 0);
        const diff = newAmount - oldAmount;

        // If it was income (receipt), increasing payment reduces customer debt
        if (editingTx.type === 'income') {
          const currentBal = Number(activeCustomer?.balance ?? 0);
          const newBal = currentBal - diff;
          await supabase.from('customers').update({ balance: newBal }).eq('id', activeCustomer?.id || customer?.id);
        } else if (editingTx.type === 'expense') {
          // If refund, increasing refund increases customer debt
          const currentBal = Number(activeCustomer?.balance ?? 0);
          const newBal = currentBal + diff;
          await supabase.from('customers').update({ balance: newBal }).eq('id', activeCustomer?.id || customer?.id);
        }

        // If order linked
        if (editingTx.reference_id && editingTx.reference_id !== (activeCustomer?.id || customer?.id)) {
          const { data: ord } = await supabase.from('custom_orders').select('paid_amount').eq('id', editingTx.reference_id).maybeSingle();
          if (ord) {
            await supabase.from('custom_orders').update({ paid_amount: Math.max(0, Number(ord.paid_amount || 0) + diff) }).eq('id', editingTx.reference_id);
          }
        }

        const { error: txErr } = await supabase
          .from('transactions')
          .update({
            amount: newAmount,
            date: chosenDate,
            created_at: chosenDateTime,
            description: editTxDescription.trim() || editingTx.description,
            payment_method: editTxPaymentMethod
          })
          .eq('id', editingTx.id);

        if (txErr) throw txErr;
      }

      toast.success('تم تعديل السند بنجاح');
      setEditingTx(null);
      await loadCustomerDetails();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      console.error('Error updating transaction:', err);
      toast.error('حدث خطأ أثناء تعديل السند: ' + (err.message || ''));
    } finally {
      setIsSubmittingEditTx(false);
    }
  };

  const handleDeleteTx = async () => {
    if (!editingTx) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا السند؟ سيتم إلغاء أثره المالي وإعادة احتساب رصيد العميل.')) {
      return;
    }

    setIsDeletingTx(true);
    try {
      let rpcDone = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('delete_customer_payment_transaction', {
          p_transaction_id: editingTx.id
        });
        if (!rpcErr && rpcRes?.success) {
          rpcDone = true;
        }
      } catch (err) {
        console.warn('RPC delete_customer_payment_transaction fallback:', err);
      }

      if (!rpcDone) {
        const txAmount = Number(editingTx.amount || 0);
        // Revert balance
        if (editingTx.type === 'income') {
          const currentBal = Number(activeCustomer?.balance ?? 0);
          await supabase.from('customers').update({ balance: currentBal + txAmount }).eq('id', activeCustomer?.id || customer?.id);
        } else if (editingTx.type === 'expense') {
          const currentBal = Number(activeCustomer?.balance ?? 0);
          await supabase.from('customers').update({ balance: currentBal - txAmount }).eq('id', activeCustomer?.id || customer?.id);
        }

        // Revert order if linked
        if (editingTx.reference_id && editingTx.reference_id !== (activeCustomer?.id || customer?.id)) {
          const { data: ord } = await supabase.from('custom_orders').select('paid_amount').eq('id', editingTx.reference_id).maybeSingle();
          if (ord) {
            await supabase.from('custom_orders').update({ paid_amount: Math.max(0, Number(ord.paid_amount || 0) - txAmount) }).eq('id', editingTx.reference_id);
          }
        }

        const { error: delErr } = await supabase.from('transactions').delete().eq('id', editingTx.id);
        if (delErr) throw delErr;
      }

      toast.success('تم حذف السند بنجاح');
      setEditingTx(null);
      await loadCustomerDetails();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      console.error('Error deleting transaction:', err);
      toast.error('حدث خطأ أثناء حذف السند: ' + (err.message || ''));
    } finally {
      setIsDeletingTx(false);
    }
  };

  // Build the complete Chronological Timeline Events
  // Including Production Orders, Accruals, Payments, and Sales Invoices!
  const timelineEvents = useMemo(() => {
    type TimelineItem = {
      id: string;
      date: string;
      timestamp: number;
      kind: 'order' | 'sale' | 'tx_income' | 'tx_expense';
      data: any;
    };

    const items: TimelineItem[] = [];

    // 0. Opening Balance (رصيد افتتاحي مسجل كدين سابق)
    const opBal = Number(activeCustomer?.opening_balance || 0);
    if (opBal > 0) {
      const dateStr = activeCustomer?.created_at || new Date(0).toISOString();
      items.push({
        id: `opening-${activeCustomer?.id}`,
        date: dateStr,
        timestamp: new Date(dateStr).getTime() || 0,
        kind: 'tx_expense',
        data: {
          id: `opening-${activeCustomer?.id}`,
          amount: opBal,
          type: 'expense',
          reference_type: 'opening_balance',
          description: 'رصيد افتتاحي مسجل كدين سابق على العميل',
          created_at: dateStr
        }
      });
    }

    // 1. Production Orders (طلبات الإنتاج)
    orders.forEach(order => {
      const dateStr = order.order_date || order.created_at;
      items.push({
        id: `order-${order.id}`,
        date: dateStr,
        timestamp: new Date(dateStr).getTime() || 0,
        kind: 'order',
        data: order
      });
    });

    // 2. Sales Invoices (فواتير المبيعات)
    sales.forEach(sale => {
      const dateStr = sale.created_at;
      items.push({
        id: `sale-${sale.id}`,
        date: dateStr,
        timestamp: new Date(dateStr).getTime() || 0,
        kind: 'sale',
        data: sale
      });
    });

    // 3. Financial Transactions (قبض دفعة / صرف دفعة)
    transactions.forEach(tx => {
      const dateStr = tx.created_at || tx.date;
      const isExpense = tx.type === 'expense' || tx.reference_type === 'customer_refund' || tx.reference_type === 'custom_order_debt';

      items.push({
        id: `tx-${tx.id}`,
        date: dateStr,
        timestamp: new Date(dateStr).getTime() || 0,
        kind: isExpense ? 'tx_expense' : 'tx_income',
        data: tx
      });
    });

    // Sort descending by date (most recent first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    return items;
  }, [orders, sales, transactions, activeCustomer?.opening_balance, activeCustomer?.created_at, activeCustomer?.id]);

  // Handle Dragging header up/down
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const diff = dragStartYRef.current - e.changedTouches[0].clientY;
    if (diff > 40) {
      // Swiped up -> collapse header
      setIsHeaderCollapsed(true);
    } else if (diff < -40) {
      // Swiped down -> expand header
      setIsHeaderCollapsed(false);
    }
    dragStartYRef.current = null;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop > 80 && !isHeaderCollapsed) {
      setIsHeaderCollapsed(true);
    } else if (scrollTop <= 10 && isHeaderCollapsed) {
      setIsHeaderCollapsed(false);
    }
  };

  if (!isOpen || !customer || !activeCustomer) return null;

  const currentDebt = Number(activeCustomer?.debt ?? activeCustomer?.balance ?? 0);
  const totalPurchasesAmount = sales.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0) +
    orders.reduce((acc, o) => acc + (Number(o.total_price) || 0), 0);
  const visitsCount = sales.length + orders.length + transactions.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm transition-all animate-fadeIn">
      <div 
        className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-gray-100 dark:border-gray-800" 
        dir="rtl"
      >
        
        {/* --- Top Emerald Header Container --- */}
        <div 
          className="bg-[#184e38] dark:bg-[#123929] text-white shrink-0 transition-all duration-300 relative select-none shadow-md"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Pinned Top Bar (Always visible, exactly as in Image 1 and Image 2) */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
            {/* Customer name in top bar (visible in compact & full mode) */}
            <h2 className="text-white font-bold text-base sm:text-lg tracking-wide truncate max-w-[220px] sm:max-w-md">
              {activeCustomer.name}
            </h2>

            {/* Middle Drag / Toggle Indicator */}
            <button
              onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
              className="flex items-center gap-1 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full text-xs transition-colors"
              title={isHeaderCollapsed ? "سحب للأسفل لإظهار كامل البيانات" : "سحب للأعلى لتكبير مساحة العرض"}
            >
              <span>{isHeaderCollapsed ? "إظهار الرأسية" : "سحب للأعلى"}</span>
              {isHeaderCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>

            {/* Circular Close Button (top-left in RTL) */}
            <button 
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Collapsible Header Content Body (Image 1 full view, collapsible to Image 2 view) */}
          <div 
            className={cn(
              "transition-all duration-300 ease-in-out px-5 sm:px-6 overflow-hidden",
              isHeaderCollapsed ? "max-h-0 opacity-0 py-0" : "max-h-[380px] opacity-100 py-4 sm:py-5"
            )}
          >
            {/* Customer Avatar & Details Row */}
            <div className="flex items-center gap-4 mb-4">
              {/* Rounded Square Avatar with initial */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#2a684d] text-white flex items-center justify-center text-3xl sm:text-4xl font-extrabold shadow-md shrink-0">
                {activeCustomer.name ? activeCustomer.name.charAt(0) : 'م'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-wide truncate">
                    {activeCustomer.name}
                  </h3>

                  {/* Archived status badge */}
                  {isCustomerArchived && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/25 text-amber-200 border border-amber-400/40">
                      <Archive className="w-3.5 h-3.5" />
                      مؤرشف (غير نشط)
                    </span>
                  )}
                  
                  {/* Edit Pencil Icon */}
                  {onEditCustomer && (
                    <button
                      onClick={() => onEditCustomer(activeCustomer)}
                      className="p-1 text-white/80 hover:text-white transition-colors"
                      title="تعديل العميل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Archive / Delete / Restore Button */}
                  {(onArchiveCustomer || onDeleteCustomer) && (
                    isCustomerArchived ? (
                      <button
                        type="button"
                        disabled={isArchiving}
                        onClick={async () => {
                          setIsArchiving(true);
                          try {
                            if (onArchiveCustomer) {
                              await onArchiveCustomer(activeCustomer.id, false);
                            }
                          } finally {
                            setIsArchiving(false);
                          }
                        }}
                        className="px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm ml-1 disabled:opacity-50"
                        title="استعادة العميل من الأرشيف وإعادة تنشيطه"
                      >
                        {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>استعادة للنشاط</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowArchiveConfirm(true)}
                        className="w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-colors shadow-sm ml-1"
                        title="أرشفة العميل (إلغاء التنشيط)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>

                {/* Phone Number */}
                <p className="text-white/80 font-mono text-sm sm:text-base">
                  {activeCustomer.phone || '0'}
                </p>
              </div>
            </div>

            {/* Action Buttons: WhatsApp & Call (Image 1) */}
            <div className="flex items-center gap-3 mb-4">
              {/* WhatsApp Button (Bright Green) */}
              <a 
                href={`https://wa.me/${(activeCustomer.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً ${activeCustomer.name}،\nكيف يمكننا مساعدتك اليوم؟`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#00c968] hover:bg-[#00b55d] text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-all active:scale-98 text-sm sm:text-base"
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>واتساب</span>
              </a>

              {/* Call Button (Dark Olive/Green with border) */}
              <a 
                href={activeCustomer.phone ? `tel:${activeCustomer.phone}` : '#'}
                className="flex-1 flex items-center justify-center gap-2 bg-[#235840] hover:bg-[#2c6e50] border border-white/20 text-white font-bold py-2.5 px-4 rounded-xl transition-all active:scale-98 text-sm sm:text-base"
              >
                <Phone className="w-5 h-5" />
                <span>اتصال</span>
              </a>
            </div>

            {/* 3 Metric Cards Row (Image 1: المشتريات, الزيارات, الرصيد) */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {/* المشتريات */}
              <div className="bg-[#235840]/75 border border-white/10 rounded-2xl p-2.5 sm:p-3 text-center">
                <span className="block text-white/70 text-xs font-medium mb-1">المشتريات</span>
                <span className="block text-white font-black text-lg sm:text-xl font-mono">
                  {totalPurchasesAmount.toLocaleString()}
                </span>
              </div>

              {/* الزيارات */}
              <div className="bg-[#235840]/75 border border-white/10 rounded-2xl p-2.5 sm:p-3 text-center">
                <span className="block text-white/70 text-xs font-medium mb-1">الزيارات</span>
                <span className="block text-white font-black text-lg sm:text-xl font-mono">
                  {visitsCount}
                </span>
              </div>

              {/* الرصيد */}
              <div className="bg-[#3d4f2a]/80 border border-amber-500/40 rounded-2xl p-2.5 sm:p-3 text-center">
                <span className="block text-amber-300 text-xs font-bold mb-1">الرصيد</span>
                <span className="block text-white font-black text-lg sm:text-xl font-mono">
                  {Math.abs(currentDebt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Drag Handle Bar at bottom of header */}
            <div 
              onClick={() => setIsHeaderCollapsed(true)}
              className="flex justify-center items-center pt-3 pb-0 cursor-pointer group"
              title="سحب للأعلى لتصغير الرأسية"
            >
              <div className="w-12 h-1 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
            </div>
          </div>
        </div>

        {/* --- Action Banner: تسجيل سداد دين (Image 1) --- */}
        <div className="px-4 sm:px-6 pt-4 pb-2 shrink-0">
          <button
            onClick={() => {
              setPayDirection(currentDebt < 0 ? 'refund' : 'pay');
              setPayAmount(currentDebt !== 0 ? Math.abs(currentDebt).toString() : '');
              setShowPayForm(!showPayForm);
            }}
            className="w-full bg-[#fff1e6] dark:bg-amber-950/30 hover:bg-[#ffe5d3] dark:hover:bg-amber-950/50 text-[#d9480f] dark:text-amber-400 font-bold rounded-2xl py-3 px-4 shadow-sm text-center flex items-center justify-center gap-2 border border-[#ffd8bf] dark:border-amber-900/50 transition-all active:scale-98 text-base"
          >
            <span className="text-lg font-black">$</span>
            <span>تسجيل سداد دين</span>
          </button>

          {/* Quick Pay / Refund Drawer Form */}
          {showPayForm && (
            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700 animate-fadeIn">
              <form onSubmit={handlePayDebtSubmit} className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPayDirection('pay')}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all",
                      payDirection === 'pay' 
                        ? "bg-[#00c968] text-white shadow-sm" 
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                    )}
                  >
                    قبض دفعة (سداد دين)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayDirection('refund')}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all",
                      payDirection === 'refund' 
                        ? "bg-rose-600 text-white shadow-sm" 
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                    )}
                  >
                    صرف دفعة (استرداد)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      التاريخ
                    </label>
                    <input
                      type="date"
                      required
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      طريقة الدفع
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                    >
                      {paymentMethodsList.map(method => (
                        <option key={method.id || method.method_id} value={method.method_id}>
                          {method?.name || method?.label || method?.method_id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      المبلغ ({currency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968] font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      البيان / الوصف (اختياري)
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: سداد دين عام..."
                      value={payDescription}
                      onChange={(e) => setPayDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPayForm(false)}
                    className="px-4 py-1.5 text-xs font-bold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPay}
                    className="px-5 py-1.5 text-xs font-bold rounded-xl bg-[#00c968] hover:bg-[#00b55d] text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmittingPay && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>تأكيد التسجيل</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* --- Scrollable Alternating Timeline (Image 1 & Image 2) --- */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 relative"
        >
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-[#00c968] mb-3" />
              <p className="text-sm font-medium">جاري تحميل المعاملات...</p>
            </div>
          ) : timelineEvents.length === 0 ? (
            <div className="py-20 text-center text-gray-400 dark:text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-base font-bold">لا توجد معاملات مسجلة</p>
              <p className="text-xs mt-1">ستظهر هنا فواتير المبيعات وطلبات الإنتاج وحركات القبض والصرف بالترتيب الزمني</p>
            </div>
          ) : (
            <div className="relative">
              {/* Central Timeline Vertical Axis (visible on screens >= sm) */}
              <div className="hidden sm:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700/80 -translate-x-1/2 pointer-events-none" />

              <div className="space-y-4 sm:space-y-6">
                {timelineEvents.map((item, index) => {
                  // In RTL:
                  // index % 2 === 0 -> sits on the RIGHT side of the timeline
                  // index % 2 === 1 -> sits on the LEFT side of the timeline
                  const isRightSide = index % 2 === 0;

                  return (
                    <div 
                      key={item.id}
                      className={cn(
                        "relative flex w-full transition-all",
                        // On small mobile: single column; on sm+: alternating 2-column layout
                        "sm:w-[calc(50%-1.25rem)]",
                        isRightSide ? "sm:mr-auto sm:ml-0" : "sm:ml-auto sm:mr-0"
                      )}
                    >
                      {/* --- Event Type 1: Production Order (طلب إنتاج) --- */}
                      {item.kind === 'order' && (
                        <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-shadow">
                          {/* Order Header: Title, Status Badge, Date */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                                طلب إنتاج #{item.data.id.split('-')[0]}
                              </h4>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                                {formatArabicDateTime(item.date)}
                              </p>
                            </div>

                            {/* Status Badge */}
                            <span className={cn(
                              "text-xs px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap",
                              item.data.status === 'delivered' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                              item.data.status === 'ready' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                              item.data.status === 'tailoring' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                              "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                            )}>
                              {item.data.status === 'delivered' ? 'تم التسليم' :
                               item.data.status === 'ready' ? 'جاهز' :
                               item.data.status === 'tailoring' ? 'قيد الإنتاج' : 'قيد الإنتاج'}
                            </span>
                          </div>

                          {/* Item Details Box with Connector Node */}
                          {item.data.custom_order_items && item.data.custom_order_items.length > 0 && (
                            <div className="my-3 bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                              {/* Connector icon positioning:
                                  If right side in RTL: inner edge is on the LEFT.
                                  If left side in RTL: inner edge is on the RIGHT.
                              */}
                              <div className="flex-1 text-xs text-gray-700 dark:text-gray-200 font-medium">
                                {item.data.custom_order_items.map((ordItem: any, idx: number) => (
                                  <div key={idx} className="truncate">
                                    <span>{ordItem.target?.name || 'تفصيل'} - {ordItem.fabric?.name || 'قماش'}</span>
                                    <span className="text-gray-400 mx-1">|</span>
                                    <span>{ordItem.quantity || 1} تفصيل</span>
                                  </div>
                                ))}
                              </div>

                              {/* Green Node Circle with Document Icon */}
                              <div className="w-8 h-8 rounded-full bg-[#00c968] text-white flex items-center justify-center shrink-0 shadow-sm">
                                <FileText className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          {/* Order Financial Breakdown (3 columns) */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-center">
                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">الإجمالي</span>
                              <span className="block text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono">
                                {Number(item.data.total_price || 0).toLocaleString()}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">المدفوع</span>
                              <span className="block text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                {Number(item.data.advance_payment || item.data.paid_amount || 0).toLocaleString()}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">المتبقي</span>
                              <span className="block text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 font-mono">
                                {Math.max(0, Number(item.data.total_price || 0) - Number(item.data.advance_payment || item.data.paid_amount || 0)).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* --- Event Type 2: Expense / Debt Accrual / Refund (صرف دفعة) --- */}
                      {item.kind === 'tx_expense' && (
                        <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-shadow">
                          {/* Title & Date & Edit Action */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                                {item.data.reference_type === 'opening_balance' ? 'رصيد افتتاحي (دين سابق)' : 'صرف دفعة'}
                              </h4>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                                {formatArabicDateTime(item.date)}
                              </p>
                            </div>
                            {item.data.reference_type !== 'opening_balance' && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditTx(item.data)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-rose-50 dark:bg-gray-700 dark:hover:bg-rose-950/40 text-gray-700 hover:text-rose-600 dark:text-gray-200 dark:hover:text-rose-400 text-xs font-bold transition-all shadow-xs border border-gray-200/60 dark:border-gray-600"
                                title="تعديل سند الصرف"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                            )}
                          </div>

                          {/* Content Box with Dollar Node */}
                          <div className="my-3 bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">
                              {item.data.description || 'صرف دفعة / استرداد'}
                            </p>

                            <div className="w-8 h-8 rounded-full bg-[#00c968] text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-sm">
                              $
                            </div>
                          </div>

                          {/* Red Amount */}
                          <div className="text-left font-black text-base sm:text-lg text-rose-600 dark:text-rose-400 font-mono pt-1">
                            {currency} {Number(item.data.amount || 0).toLocaleString()} -
                          </div>
                        </div>
                      )}

                      {/* --- Event Type 3: Income / Payment Received (قبض دفعة) --- */}
                      {item.kind === 'tx_income' && (
                        <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-shadow">
                          {/* Title & Date & Edit Action */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                                قبض دفعة
                              </h4>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                                {formatArabicDateTime(item.date)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenEditTx(item.data)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-emerald-50 dark:bg-gray-700 dark:hover:bg-emerald-950/40 text-gray-700 hover:text-emerald-600 dark:text-gray-200 dark:hover:text-emerald-400 text-xs font-bold transition-all shadow-xs border border-gray-200/60 dark:border-gray-600"
                              title="تعديل سند القبض"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                          </div>

                          {/* Content Box with Dollar Node */}
                          <div className="my-3 bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium">
                              {item.data.description || 'قبض دفعة / سداد حساب'}
                            </p>

                            <div className="w-8 h-8 rounded-full bg-[#00c968] text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-sm">
                              $
                            </div>
                          </div>

                          {/* Green Amount */}
                          <div className="text-left font-black text-base sm:text-lg text-emerald-600 dark:text-emerald-400 font-mono pt-1">
                            + {Number(item.data.amount || 0).toLocaleString()} {currency}
                          </div>
                        </div>
                      )}

                      {/* --- Event Type 4: Sales Invoice (فاتورة مبيعات) --- */}
                      {item.kind === 'sale' && (
                        <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-shadow">
                          {/* Header: Title, Status Badge, Date */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <h4 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                                فاتورة مبيعات #{item.data.id.split('-')[0]}
                              </h4>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                                {formatArabicDateTime(item.date)}
                              </p>
                            </div>

                            <span className={cn(
                              "text-xs px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap",
                              Number(item.data.paid_amount || 0) >= Number(item.data.total_amount || 0)
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : Number(item.data.paid_amount || 0) > 0
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                            )}>
                              {Number(item.data.paid_amount || 0) >= Number(item.data.total_amount || 0)
                                ? "مدفوعة"
                                : Number(item.data.paid_amount || 0) > 0
                                ? "دفعة جزئية"
                                : "آجل"}
                            </span>
                          </div>

                          {/* Content Box with Products & ShoppingCart Node */}
                          {item.data.sale_items && item.data.sale_items.length > 0 && (
                            <div className="my-3 bg-gray-50 dark:bg-gray-750 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                              <div className="flex-1 text-xs text-gray-700 dark:text-gray-200 font-medium">
                                {item.data.sale_items.map((saleItem: any, idx: number) => (
                                  <div key={idx} className="truncate">
                                    <span>{saleItem.product_name || 'صنف'}</span>
                                    <span className="text-gray-400 mx-1">|</span>
                                    <span>{saleItem.quantity} {saleItem.product_unit || 'قطعة'}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="w-8 h-8 rounded-full bg-[#00c968] text-white flex items-center justify-center shrink-0 shadow-sm">
                                <ShoppingCart className="w-4 h-4" />
                              </div>
                            </div>
                          )}

                          {/* Financial Breakdown */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 text-center">
                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">الإجمالي</span>
                              <span className="block text-xs sm:text-sm font-black text-gray-900 dark:text-white font-mono">
                                {Number(item.data.total_amount || 0).toLocaleString()}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">المدفوع</span>
                              <span className="block text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                {Number(item.data.paid_amount || 0).toLocaleString()}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">المتبقي</span>
                              <span className="block text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400 font-mono">
                                {Math.max(0, Number(item.data.total_amount || 0) - Number(item.data.paid_amount || 0)).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-100 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Archive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">أرشفة العميل</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{activeCustomer.name}</p>
              </div>
            </div>

            <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">
              <p>هل أنت متأكد من رغبتك في أرشفة هذا العميل؟</p>
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1 font-medium">
                <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  ماذا يحدث عند أرشفة العميل؟
                </p>
                <p>• سيتم إلغاء تنشيطه ولن يظهر في قوائم فواتير البيع، سندات القبض/الصرف، أو طلبات الإنتاج.</p>
                <p>• لن يتم حذف أي بيانات أو فواتير سابقة، وستظل محفوظة بالكامل في حسابه.</p>
                <p>• يمكنك الوصول لملفه واستعادته للنشاط في أي وقت من تبويب الأرشيف.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isArchiving}
                onClick={() => setShowArchiveConfirm(false)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isArchiving}
                onClick={async () => {
                  setIsArchiving(true);
                  try {
                    setShowArchiveConfirm(false);
                    if (onArchiveCustomer) {
                      await onArchiveCustomer(activeCustomer.id, true);
                    } else if (onDeleteCustomer) {
                      await onDeleteCustomer(activeCustomer.id);
                    }
                  } finally {
                    setIsArchiving(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                <span>نعم، أرشفة العميل</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Voucher Modal --- */}
      {editingTx && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  {editingTx.type === 'income' ? 'تعديل سند قبض' : 'تعديل سند صرف'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  تاريخ السند
                </label>
                <input
                  type="date"
                  required
                  value={editTxDate}
                  onChange={(e) => setEditTxDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    المبلغ ({currency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.01"
                    value={editTxAmount}
                    onChange={(e) => setEditTxAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968] font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    طريقة الدفع
                  </label>
                  <select
                    value={editTxPaymentMethod}
                    onChange={(e) => setEditTxPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                  >
                    {paymentMethodsList.map(method => (
                      <option key={method.id || method.method_id} value={method.method_id}>
                        {method?.name || method?.label || method?.method_id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  البيان / الوصف
                </label>
                <input
                  type="text"
                  required
                  value={editTxDescription}
                  onChange={(e) => setEditTxDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-[#00c968]"
                  placeholder="مثال: سداد دين عام"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  disabled={isDeletingTx || isSubmittingEditTx}
                  onClick={handleDeleteTx}
                  className="px-3 py-2 text-xs font-bold rounded-xl text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title="حذف هذا السند وإلغاء أثره المالي"
                >
                  {isDeletingTx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>حذف السند</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTx(null)}
                    disabled={isSubmittingEditTx || isDeletingTx}
                    className="px-4 py-2 text-xs font-bold rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEditTx || isDeletingTx}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-[#00c968] hover:bg-[#00b55d] text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSubmittingEditTx && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>حفظ التعديلات</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
