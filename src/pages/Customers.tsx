import React, { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Users, Search, MessageCircle, Phone, Star, 
  TrendingUp, Clock, ShoppingCart, AlertCircle, X, Send, 
  Plus, DollarSign, Sparkles, FileText, Bot, RefreshCw, CheckCircle2, Loader2, Package, Lock, Edit2,
  Archive, RotateCcw
} from 'lucide-react';
import { cn } from '../utils';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { useSettings } from '../contexts/SettingsContext';
import { useSubscription } from '../components/SubscriptionGuard';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { CustomerProfileModal } from '../components/CustomerProfileModal';

// --- Types ---
type Sale = {
  id: string;
  total_amount: number;
  paid_amount: number;
  created_at: string;
};

type Transaction = {
  id: string;
  amount: number;
  date: string;
  type: string;
  description: string;
  payment_method?: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
  balance: number;
  opening_balance?: number;
  is_active?: boolean;
  is_archived?: boolean;
  created_at: string;
  visits: number;
  total_spent: number;
  debt: number; // Derived from balance
};

// --- Dynamic Categorization Logic ---
const getCustomerCategory = (customer: Customer) => {
  if (customer.total_spent >= 10000) return { id: 'vip', label: 'VIP', color: 'bg-brand-accent/20 text-brand-accent', icon: Star };
  if (customer.total_spent >= 5000) return { id: 'special', label: 'مميز', color: 'bg-brand-primary/20 text-brand-primary', icon: TrendingUp };
  if (customer.visits > 3) return { id: 'regular', label: 'عادي', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Users };
  return { id: 'new', label: 'جديد', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Sparkles };
};

export function Customers() {
  const { settings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const { data: paymentMethodsList = [] } = usePaymentMethods();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'vip' | 'special' | 'regular' | 'new' | 'debt'>('all');
  const [customerView, setCustomerView] = useState<'active' | 'archived'>('active');
  
  // Modals State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // WhatsApp Messaging State
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageMode, setMessageMode] = useState<'individual' | 'bulk'>('bulk');
  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Bulk Sending Queue State
  const [bulkQueue, setBulkQueue] = useState<Customer[]>([]);
  const [currentBulkIndex, setCurrentBulkIndex] = useState(0);

  // Add Customer State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<{ id: string; name: string; phone: string; opening_balance?: string | number }>({ id: '', name: '', phone: '', opening_balance: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', notes: '', opening_balance: '' });
  const [userRole, setUserRole] = useState<'admin' | 'seller' | 'accountant'>('admin');

  const [addError, setAddError] = useState('');

  // --- Fetch Data ---
  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data);
      }
    });
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const currentUserId = tenantIdData || sessionData.session?.user.id;
      if (!currentUserId) return;

      // 1. Load from Local DB (IndexedDB) first for instant UI
      try {
        const localCustomers = await db.customers.orderBy('name').toArray();
        if (localCustomers.length > 0) {
          const enrichedLocalData = localCustomers.map(customer => ({
            ...customer,
            total_spent: customer.total_spent || 0,
            visits: customer.visits || 0,
            debt: Number(customer.balance || 0)
          })) as Customer[];
          setCustomers(enrichedLocalData);
        }
      } catch (localErr) {
        console.error("Error reading from local DB:", localErr);
      }

      // 2. If offline, stop here
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }

      // 3. Fetch from Supabase (Sync)
      const [customersRes, salesRes] = await Promise.all([
        supabase.from('customers').select('*').eq('tenant_id', currentUserId).order('name', { ascending: true }),
        supabase.from('sales').select('customer_id, total_amount, created_at').eq('tenant_id', currentUserId)
      ]);
      
      if (customersRes.error) throw customersRes.error;
      
      const sales = salesRes.data || [];

      const enrichedCustomers = (customersRes.data || []).map(customer => {
        const customerSales = sales.filter(s => s.customer_id === customer.id);
        
        const totalSpent = customerSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
        const uniqueDates = new Set(customerSales.map(s => s.created_at.split('T')[0]));
        const visits = uniqueDates.size;

        return {
          ...customer,
          total_spent: totalSpent,
          visits: visits,
          debt: Number(customer.balance || 0)
        };
      });

      setCustomers(enrichedCustomers);

      // Update local DB with fresh customers
      if (enrichedCustomers.length > 0) {
        await db.customers.bulkPut(enrichedCustomers);
      }

    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  // --- Derived Data ---
  const activeCustomers = useMemo(() => {
    return customers.filter(c => c.is_active !== false && !c.is_archived);
  }, [customers]);

  const archivedCustomers = useMemo(() => {
    return customers.filter(c => c.is_active === false || c.is_archived === true);
  }, [customers]);

  const totalDebt = activeCustomers.reduce((sum, c) => sum + (Number(c.debt) || 0), 0);
  
  const filteredCustomers = useMemo(() => {
    const sourceList = customerView === 'active' ? activeCustomers : archivedCustomers;
    return sourceList.filter(c => {
      const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (c.phone && c.phone.includes(searchQuery));
      if (customerView === 'archived') {
        return matchesSearch;
      }
      const category = getCustomerCategory(c);
      
      if (selectedFilter === 'debt') return matchesSearch && c.debt !== 0;
      if (selectedFilter !== 'all') return matchesSearch && category.id === selectedFilter;
      return matchesSearch;
    });
  }, [activeCustomers, archivedCustomers, customerView, searchQuery, selectedFilter]);

  // --- Handlers ---
  const handleWhatsAppClick = (phone: string, message: string = '') => {
    const formattedPhone = phone.replace(/^0+/, '');
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
  };

  const openMessageModal = (mode: 'individual' | 'bulk', customer?: Customer) => {
    setMessageMode(mode);
    setTargetCustomer(customer || null);
    setMessageText('');
    setBulkQueue([]);
    setCurrentBulkIndex(0);
    setIsMessageModalOpen(true);
  };

  const generateAIText = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `اكتب رسالة تسويقية قصيرة وجذابة لعملاء متجر تجزئة، تتضمن ترحيباً وعرضاً خاصاً، استخدم الإيموجي المناسبة. لا تضف أي مقدمات، فقط نص الرسالة.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      if (response.text) {
        setMessageText(response.text);
      }
    } catch (error) {
      console.error("Error generating text:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const startBulkSend = () => {
    if (messageMode === 'individual' && targetCustomer) {
      const personalizedMessage = messageText.replace(/{الاسم}/g, targetCustomer.name.split(' ')[0]);
      handleWhatsAppClick(targetCustomer.phone, personalizedMessage);
      setIsMessageModalOpen(false);
    } else {
      setBulkQueue(filteredCustomers);
      setCurrentBulkIndex(0);
    }
  };

  const sendNextBulk = () => {
    if (currentBulkIndex < bulkQueue.length) {
      const customer = bulkQueue[currentBulkIndex];
      const personalizedMessage = messageText.replace(/{الاسم}/g, customer.name.split(' ')[0]);
      handleWhatsAppClick(customer.phone, personalizedMessage);
      setCurrentBulkIndex(prev => prev + 1);
    }
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!newCustomer.name || !newCustomer.phone) {
      setAddError('يرجى إدخال اسم العميل ورقم الهاتف');
      return;
    }

    setAddError('');
    setIsAddModalOpen(false);
    const savedForm = { ...newCustomer };
    setNewCustomer({ name: '', phone: '', notes: '', opening_balance: '' });

    const promise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('يجب تسجيل الدخول لإضافة عميل');

      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || sessionData.session.user.id;

      const openingBalance = Number(savedForm.opening_balance) || 0;

      const { data: customerData, error } = await supabase.from('customers').insert([{
        tenant_id: tenantId,
        name: savedForm.name,
        phone: savedForm.phone,
        notes: savedForm.notes,
        opening_balance: openingBalance,
        balance: openingBalance
      }]).select().single();

      if (error) throw error;
      fetchCustomers();
    })();

    toast.promise(promise, {
      loading: 'جاري إضافة العميل...',
      success: 'تم إضافة العميل بنجاح',
      error: 'حدث خطأ أثناء إضافة العميل'
    });
  };

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!editingCustomer.name.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }

    setIsEditing(true);
    const promise = (async () => {
      // 1. Get current customer record to calculate balance difference
      const { data: currentCust, error: fetchErr } = await supabase
        .from('customers')
        .select('balance, opening_balance')
        .eq('id', editingCustomer.id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      const oldOpening = Number(currentCust?.opening_balance || 0);
      const newOpening = Number(editingCustomer.opening_balance) || 0;
      const diff = newOpening - oldOpening;
      const currentBalance = Number(currentCust?.balance || 0);
      const newBalance = currentBalance + diff;

      const { error } = await supabase
        .from('customers')
        .update({
          name: editingCustomer.name.trim(),
          phone: editingCustomer.phone.trim(),
          opening_balance: newOpening,
          balance: newBalance
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      // Update local db
      try {
        await db.customers.update(editingCustomer.id, {
          name: editingCustomer.name.trim(),
          phone: editingCustomer.phone.trim(),
          opening_balance: newOpening,
          balance: newBalance,
          debt: newBalance
        });
      } catch (localErr) {
        console.error('Error updating local customer:', localErr);
      }
      
      setIsEditModalOpen(false);
      if (selectedCustomer && selectedCustomer.id === editingCustomer.id) {
        setSelectedCustomer(prev => prev ? { 
          ...prev, 
          name: editingCustomer.name.trim(), 
          phone: editingCustomer.phone.trim(),
          opening_balance: newOpening,
          balance: newBalance,
          debt: newBalance
        } : prev);
      }
      fetchCustomers();
    })();

    toast.promise(promise, {
      loading: 'جاري تحديث بيانات العميل...',
      success: 'تم تحديث البيانات بنجاح',
      error: 'حدث خطأ أثناء تحديث البيانات'
    }).finally(() => {
      setIsEditing(false);
    });
  };

  const handleArchiveCustomer = async (customerId: string, archive: boolean) => {
    try {
      // 1. Update Supabase
      const { error } = await supabase
        .from('customers')
        .update({ is_active: !archive })
        .eq('id', customerId);

      if (error) throw error;

      // 2. Update local Dexie DB
      try {
        await db.customers.update(customerId, { is_active: !archive });
      } catch (e) {
        console.warn('Could not update Dexie customer:', e);
      }

      // 3. Update memory state
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, is_active: !archive } : c));
      
      if (selectedCustomer && selectedCustomer.id === customerId) {
        setSelectedCustomer(prev => prev ? { ...prev, is_active: !archive } : null);
      }

      toast.success(archive ? 'تمت أرشفة العميل بنجاح ونقله إلى الأرشيف' : 'تمت استعادة العميل من الأرشيف وتنشيطه بنجاح');
      fetchCustomers();
    } catch (err: any) {
      console.error('Error toggling customer archive:', err);
      toast.error('حدث خطأ أثناء تعديل حالة العميل: ' + (err.message || ''));
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    // When delete is triggered, archive customer as requested
    await handleArchiveCustomer(customerId, true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* --- Dashboard Cards --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-primary/10 rounded-2xl flex items-center justify-center text-brand-primary">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">العملاء النشطون</p>
              {archivedCustomers.length > 0 && (
                <button 
                  type="button"
                  onClick={() => setCustomerView(customerView === 'archived' ? 'active' : 'archived')}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors"
                  title="عرض أرشيف العملاء"
                >
                  <Archive className="w-3 h-3" />
                  <span>{archivedCustomers.length} في الأرشيف</span>
                </button>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : activeCustomers.length}
            </p>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-orange-50 dark:bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">الديون المستحقة</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `${totalDebt.toLocaleString()} ${settings.currency}`}
            </p>
          </div>
        </div>

        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-brand-dark hover:bg-brand-dark/90 transition-colors p-6 rounded-3xl shadow-sm flex items-center justify-center gap-3 text-white group"
        >
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold">إضافة عميل</span>
        </button>
      </div>

      {/* --- Customer List Section --- */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
        {/* Search & Filters */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 space-y-4">
          {/* View Switcher: Active vs Archive */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setCustomerView('active')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                  customerView === 'active'
                    ? "bg-white dark:bg-gray-900 text-brand-dark dark:text-white shadow-xs"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                )}
              >
                <Users className="w-4 h-4" />
                <span>العملاء النشطون</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-brand-primary/10 text-brand-primary font-mono">
                  {activeCustomers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCustomerView('archived')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                  customerView === 'archived'
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                )}
              >
                <Archive className="w-4 h-4" />
                <span>الأرشيف</span>
                {archivedCustomers.length > 0 && (
                  <span className={cn(
                    "px-2 py-0.5 text-xs rounded-full font-mono",
                    customerView === 'archived' ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  )}>
                    {archivedCustomers.length}
                  </span>
                )}
              </button>
            </div>

            {userRole === 'admin' && customerView === 'active' && (
              <button 
                onClick={() => openMessageModal('bulk')}
                className="flex items-center justify-center gap-2 bg-brand-primary hover:opacity-90 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-sm shadow-brand-primary/20 text-sm whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4" />
                <span>إرسال جماعي</span>
              </button>
            )}
          </div>

          {/* Archived Notice Banner */}
          {customerView === 'archived' && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 rounded-2xl p-3.5 flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <Archive className="w-5 h-5" />
              </div>
              <div className="flex-1 text-xs">
                <h5 className="font-bold text-amber-900 dark:text-amber-200 text-sm mb-0.5">سجل العملاء المؤرشفين (ملغى نشاطهم)</h5>
                <p className="text-amber-800/80 dark:text-amber-400/80 leading-relaxed">
                  هؤلاء العملاء لا يظهرون في فواتير البيع أو سندات القبض/الصرف أو طلبات الإنتاج، ولكن سجلاتهم المحاسبية وجميع فواتيرهم السابقة محفوظة تماماً. يمكنك الضغط على أي عميل لمشاهدة حسابه أو الضغط على «استعادة» لإعادته للنشاط فوراً.
                </p>
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                placeholder="ابحث باسم العميل أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-12 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
              />
            </div>
          </div>

          {/* Category Filter Pills (only when in active view) */}
          {customerView === 'active' && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'vip', label: 'VIP' },
                { id: 'special', label: 'مميز' },
                { id: 'regular', label: 'عادي' },
                { id: 'new', label: 'جديد' },
                { id: 'debt', label: 'أرصدة وديون' },
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setSelectedFilter(filter.id as any)}
                  className={cn(
                    "px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors border",
                    selectedFilter === filter.id 
                      ? "bg-brand-dark text-white border-brand-dark" 
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 min-h-[300px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-primary" />
              <p className="font-medium">جاري تحميل بيانات العملاء...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400 font-medium">
              لا يوجد عملاء يطابقون معايير البحث. (أو قاعدة البيانات فارغة)
            </div>
          ) : (
            filteredCustomers.map(customer => {
              const category = getCustomerCategory(customer);
              const CategoryIcon = category.icon;
              
              return (
                <div key={customer.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div 
                    className="flex items-center gap-4 cursor-pointer flex-1"
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 text-brand-dark flex items-center justify-center text-xl font-bold shrink-0">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">{customer.name}</h3>
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold", category.color)}>
                          <CategoryIcon className="w-3 h-3" />
                          {category.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 font-medium">
                        <span>المبيعات: {Number(customer.total_spent).toLocaleString()}</span>
                        <span>•</span>
                        <span>الزيارات: {customer.visits}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
                    {customer.debt > 0 ? (
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-0.5">الدين المستحق</p>
                        <p className="font-bold text-orange-500">{Number(customer.debt).toLocaleString()} {settings.currency}</p>
                      </div>
                    ) : customer.debt < 0 ? (
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-0.5">رصيد دائن للمقاول/العميل</p>
                        <p className="font-bold text-emerald-500">{Math.abs(customer.debt).toLocaleString()} {settings.currency}</p>
                      </div>
                    ) : (
                      <div className="text-right opacity-0 md:opacity-100">
                        <p className="text-xs font-bold text-gray-500 mb-0.5">-</p>
                        <p className="font-bold text-gray-400">-</p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      {customerView === 'archived' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchiveCustomer(customer.id, false);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-200 dark:border-emerald-800/40 text-xs font-bold transition-all shadow-xs"
                          title="استعادة العميل من الأرشيف وتنشيطه"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استعادة للنشاط</span>
                        </button>
                      )}

                      <a 
                        href={`https://wa.me/${(customer.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً ${customer.name}،\nكيف يمكننا مساعدتك اليوم؟`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-10 h-10 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center hover:bg-[#25D366] hover:text-white transition-colors shrink-0"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* --- Customer Profile Modal --- */}
      {selectedCustomer && (
        <CustomerProfileModal
          customer={selectedCustomer}
          isOpen={Boolean(selectedCustomer)}
          onClose={() => setSelectedCustomer(null)}
          onCustomerUpdated={fetchCustomers}
          onEditCustomer={(cust) => {
            setEditingCustomer({ 
              id: cust.id, 
              name: cust.name, 
              phone: cust.phone,
              opening_balance: cust.opening_balance !== undefined && cust.opening_balance !== null ? String(cust.opening_balance) : '0'
            });
            setIsEditModalOpen(true);
          }}
          onDeleteCustomer={handleDeleteCustomer}
          onArchiveCustomer={handleArchiveCustomer}
          settings={settings}
          paymentMethodsList={paymentMethodsList}
          isExpired={isExpired}
          setShowRenewModal={setShowRenewModal}
        />
      )}

      {/* --- WhatsApp Messaging Modal --- */}
      {isMessageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" dir="rtl">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-brand-dark text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">نظام المراسلة (WhatsApp)</h3>
                  <p className="text-white/70 text-sm font-medium">
                    {messageMode === 'bulk' ? `إرسال جماعي لـ ${filteredCustomers.length} عميل` : `إرسال إلى ${targetCustomer?.name}`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsMessageModalOpen(false)}
                className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900 space-y-6">
              
              {/* If Bulk Queue is Active */}
              {bulkQueue.length > 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                  <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center">
                    <Send className="w-10 h-10 text-brand-primary ml-2" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">جاري الإرسال الجماعي</h3>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      تم إرسال <span className="font-bold text-brand-primary text-lg">{currentBulkIndex}</span> من أصل <span className="font-bold text-gray-900 dark:text-white text-lg">{bulkQueue.length}</span>
                    </p>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-brand-primary h-full transition-all duration-300" 
                      style={{ width: `${(currentBulkIndex / bulkQueue.length) * 100}%` }}
                    ></div>
                  </div>

                  {currentBulkIndex < bulkQueue.length ? (
                    <div className="w-full max-w-md bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm mt-4">
                      <p className="text-sm text-gray-500 mb-4 font-bold">العميل التالي:</p>
                      <div className="flex items-center justify-between mb-6">
                        <span className="font-bold text-lg text-gray-900 dark:text-white">{bulkQueue[currentBulkIndex].name}</span>
                        <span className="text-gray-500 font-mono" dir="ltr">+{bulkQueue[currentBulkIndex].phone}</span>
                      </div>
                      <button 
                        onClick={sendNextBulk}
                        className="w-full py-3.5 rounded-xl font-bold text-white bg-brand-primary hover:opacity-90 shadow-sm shadow-brand-primary/20 transition-colors flex items-center justify-center gap-2"
                      >
                        <Send className="w-5 h-5" />
                        <span>إرسال وفتح واتساب</span>
                      </button>
                    </div>
                  ) : (
                    <div className="w-full max-w-md bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex flex-col items-center gap-3">
                      <CheckCircle2 className="w-12 h-12" />
                      <p className="font-bold text-lg">تم الانتهاء من الإرسال بنجاح!</p>
                      <button 
                        onClick={() => setIsMessageModalOpen(false)}
                        className="mt-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                      >
                        إغلاق
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Composer UI */
                <>
                  {/* Toggle Mode */}
                  <div className="flex bg-gray-200/50 dark:bg-gray-800 p-1 rounded-xl w-fit mx-auto">
                    <button
                      onClick={() => setMessageMode('individual')}
                      className={cn(
                        "px-6 py-2 rounded-lg font-bold text-sm transition-all",
                        messageMode === 'individual' ? "bg-white dark:bg-gray-700 text-brand-dark shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      إرسال فردي
                    </button>
                    <button
                      onClick={() => setMessageMode('bulk')}
                      className={cn(
                        "px-6 py-2 rounded-lg font-bold text-sm transition-all",
                        messageMode === 'bulk' ? "bg-white dark:bg-gray-700 text-brand-dark shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      إرسال جماعي
                    </button>
                  </div>

                  {/* Quick Templates */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">قوالب جاهزة سريعة</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setMessageText('مرحباً {الاسم} 👋\nلدينا عروض خاصة لك هذا الأسبوع على منتجاتك المفضلة! لا تفوت الفرصة وقم بزيارتنا قريباً 🎁')}
                        className="p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl hover:border-brand-primary hover:shadow-sm transition-all text-right group"
                      >
                        <div className="text-2xl mb-2">🎁</div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-1 group-hover:text-brand-primary transition-colors">عرض ترويجي</h4>
                        <p className="text-xs text-gray-500 font-medium line-clamp-2">مرحباً {'{الاسم}'} 👋 لدينا عروض خاصة لك هذا الأسبوع...</p>
                      </button>
                      <button 
                        onClick={() => setMessageText('مرحباً {الاسم} 🌸\nنود تذكيركم بلطف بتسديد الرصيد المتبقي في حسابكم. نقدر تعاملكم المستمر معنا 💳')}
                        className="p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl hover:border-orange-500 hover:shadow-sm transition-all text-right group"
                      >
                        <div className="text-2xl mb-2">💳</div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-1 group-hover:text-orange-500 transition-colors">تذكير بالديون</h4>
                        <p className="text-xs text-gray-500 font-medium line-clamp-2">مرحباً {'{الاسم}'} 🌸 نود تذكيركم بلطف بتسديد الرصيد...</p>
                      </button>
                    </div>
                  </div>

                  {/* Text Area & AI */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden focus-within:ring-2 focus-within:ring-brand-primary focus-within:border-transparent transition-all">
                    <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-sm font-bold text-gray-600 dark:text-gray-300">نص الرسالة</span>
                      <button 
                        onClick={generateAIText}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                      >
                        {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                        <span>توليد بالذكاء الاصطناعي</span>
                      </button>
                    </div>
                    <textarea 
                      rows={5}
                      placeholder="اكتب رسالتك هنا... استخدم {الاسم} ليتم استبداله باسم العميل."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="w-full p-4 bg-transparent text-gray-900 dark:text-white outline-none resize-none font-medium"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer Actions (Only show if not in queue mode) */}
            {bulkQueue.length === 0 && (
              <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                <button 
                  onClick={startBulkSend}
                  disabled={!messageText.trim() || (messageMode === 'bulk' && filteredCustomers.length === 0) || (messageMode === 'individual' && !targetCustomer)}
                  className="w-full py-4 rounded-2xl font-bold text-white text-lg bg-brand-primary hover:opacity-90 shadow-lg shadow-brand-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Send className="w-6 h-6" />
                  <span>
                    {messageMode === 'bulk' 
                      ? `بدء الإرسال لـ ${filteredCustomers.length} عميل` 
                      : `إرسال إلى ${targetCustomer?.name || 'العميل'}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* --- Add Customer Modal --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]" dir="rtl">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20 shrink-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-6 h-6 text-brand-primary" />
                إضافة عميل جديد
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="p-6 space-y-4 overflow-y-auto flex-1">
              {addError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-center gap-2 text-sm font-bold border border-red-100 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{addError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم العميل <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="مثال: أحمد محمد"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رقم الهاتف (واتساب) <span className="text-red-500">*</span></label>
                <input 
                  type="tel" 
                  required
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="مثال: 22247071347"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الرصيد الافتتاحي (دين على العميل)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.01"
                    value={newCustomer.opening_balance}
                    onChange={(e) => setNewCustomer({...newCustomer, opening_balance: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium pl-12"
                    placeholder="0.00"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">
                    {settings.currency}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">أدخل المبلغ إذا كان العميل مدين لك بمبلغ سابق قبل استخدام التطبيق.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظات (اختياري)</label>
                <textarea 
                  rows={3}
                  value={newCustomer.notes}
                  onChange={(e) => setNewCustomer({...newCustomer, notes: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium resize-none"
                  placeholder="أي معلومات إضافية عن العميل..."
                />
              </div>

              <div className="pt-4 mt-6 border-t border-gray-100 dark:border-gray-800">
                <button 
                  type="submit"
                  disabled={isAdding}
                  className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  <span>حفظ العميل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Edit Customer Modal --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-brand-primary" />
                تعديل بيانات العميل
              </h2>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditCustomer} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم العميل <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  required
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({...editingCustomer, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رقم الهاتف (واتساب) <span className="text-red-500">*</span></label>
                <input 
                  type="tel" 
                  required
                  value={editingCustomer.phone}
                  onChange={(e) => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الرصيد الافتتاحي (دين سابق)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.01"
                    value={editingCustomer.opening_balance ?? ''}
                    onChange={(e) => setEditingCustomer({...editingCustomer, opening_balance: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium pl-12"
                    placeholder="0.00"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">
                    {settings.currency}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">الرصيد الافتتاحي هو دين سابق على العميل قبل بدء التعامل.</p>
              </div>

              <div className="pt-4 mt-6 border-t border-gray-100 dark:border-gray-800">
                <button 
                  type="submit"
                  disabled={isEditing}
                  className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isEditing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  <span>تحديث البيانات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
