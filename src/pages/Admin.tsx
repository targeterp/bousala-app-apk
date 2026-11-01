import toast from 'react-hot-toast';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Ticket, CheckCircle, Clock, XCircle, Loader2, 
  Plus, Search, DollarSign, Image as ImageIcon, ExternalLink, FileText,
  Activity, Users, Crown, ShoppingBag, ArrowUpDown
} from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { cn } from '../utils';
import { useSettings } from '../contexts/SettingsContext';

export function Admin() {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'users' | 'vouchers' | 'subscription_vouchers' | 'ads'>('users');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Users State
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'last_login' | 'most_sales' | 'most_products'>('last_login');

  // Vouchers State
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [newVoucherAmount, setNewVoucherAmount] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Subscription Vouchers State
  const [subVouchers, setSubVouchers] = useState<any[]>([]);
  const [newSubVoucherPlan, setNewSubVoucherPlan] = useState<'monthly' | 'annual'>('monthly');
  const [isGeneratingSub, setIsGeneratingSub] = useState(false);

  // Ads State
  const [ads, setAds] = useState<any[]>([]);
  const [updatingAdId, setUpdatingAdId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      if (activeTab === 'users') {
        const { data, error } = await supabase.rpc('get_admin_users_stats');
        if (error) throw error;
        if (data) setUsers(data);
      } else if (activeTab === 'vouchers') {
        const { data, error } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) setVouchers(data);
      } else if (activeTab === 'subscription_vouchers') {
        const { data, error } = await supabase.from('subscription_vouchers').select('*, used_by_profile:profiles!used_by(full_name)').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) setSubVouchers(data);
      } else {
        const { data, error } = await supabase.from('facebook_ads').select('*, profiles:tenant_id(full_name)').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) setAds(data);
      }
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      setFetchError(error.message || 'حدث خطأ أثناء جلب البيانات');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(u => 
        (u.full_name?.toLowerCase().includes(term)) ||
        (u.email?.toLowerCase().includes(term)) ||
        (u.phone?.includes(term)) ||
        (u.id?.includes(term))
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortBy === 'last_login') {
        const da = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
        const db = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
        return db - da;
      } else if (sortBy === 'most_sales') {
        return (b.sales_count || 0) - (a.sales_count || 0);
      } else if (sortBy === 'most_products') {
        return (b.products_count || 0) - (a.products_count || 0);
      }
      return 0;
    });

    return result;
  }, [users, searchTerm, sortBy]);

  // Derived user statistics
  const stats = useMemo(() => {
    const now = new Date().getTime();
    const activeLast7Days = users.filter(u => u.last_sign_in_at && (now - new Date(u.last_sign_in_at).getTime()) < 7 * 24 * 60 * 60 * 1000).length;
    const paidSubscribers = users.filter(u => ['monthly', 'annual', 'lifetime'].includes(u.subscription_plan)).length;
    const totalPlatformSales = users.reduce((sum, u) => sum + (u.sales_count || 0), 0);
    
    return {
      totalUsers: users.length,
      activeLast7Days,
      paidSubscribers,
      totalPlatformSales
    };
  }, [users]);


  const generateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoucherAmount || isNaN(Number(newVoucherAmount))) return;
    
    setIsGenerating(true);
    try {
      // Generate a random code like TGT-XXXX-XXXX
      const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `TGT-${randomPart1}-${randomPart2}`;

      const { error } = await supabase.from('vouchers').insert([{
        code,
        amount: Number(newVoucherAmount)
      }]);

      if (error) throw error;
      
      setNewVoucherAmount('');
      fetchData();
    } catch (error: any) {
      console.error('Error generating voucher:', error);
      toast.error('حدث خطأ أثناء توليد القسيمة: ' + (error.message || JSON.stringify(error)));
    } finally {
      setIsGenerating(false);
    }
  };

  const generateSubVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsGeneratingSub(true);
    try {
      // Generate a random code like SUB-XXXX-XXXX
      const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `SUB-${randomPart1}-${randomPart2}`;

      const { error } = await supabase.from('subscription_vouchers').insert([{
        code,
        plan_type: newSubVoucherPlan
      }]);

      if (error) throw error;
      
      fetchData();
    } catch (error: any) {
      console.error('Error generating subscription voucher:', error);
      toast.error('حدث خطأ أثناء توليد القسيمة: ' + (error.message || JSON.stringify(error)));
    } finally {
      setIsGeneratingSub(false);
    }
  };

  const updateAdStatus = async (id: string, newStatus: string) => {
    setUpdatingAdId(id);
    try {
      const { error } = await supabase.from('facebook_ads').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error updating ad status:', error);
      toast.error('حدث خطأ أثناء تحديث حالة الإعلان');
    } finally {
      setUpdatingAdId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">لوحة الإدارة</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة القسائم وطلبات الإعلانات الممولة.</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 space-x-reverse border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'users' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          المستخدمين
        </button>
        <button
          onClick={() => setActiveTab('vouchers')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'vouchers' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          قسائم الشحن (إعلانات)
        </button>
        <button
          onClick={() => setActiveTab('subscription_vouchers')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'subscription_vouchers' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          قسائم الاشتراك
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'ads' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          طلبات الإعلانات
        </button>
      </div>

      {fetchError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl font-bold">
          خطأ: {fetchError}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-6">
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/20 text-brand-primary flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">إجمالي المستخدمين</p>
                <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.totalUsers}</div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">نشطون مؤخراً (7 أيام)</p>
                <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.activeLast7Days}</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">اشتراكات مدفوعة</p>
                <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.paidSubscribers}</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">إجمالي عمليات البيع</p>
                <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.totalPlatformSales.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="ابحث بالاسم، الإيميل، رقم الهاتف..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl pr-12 pl-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all shadow-sm"
              />
            </div>
            
            <div className="relative shrink-0 w-full sm:w-auto">
              <ArrowUpDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="w-full sm:w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl pr-12 pl-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none appearance-none font-bold shadow-sm"
              >
                <option value="last_login">حسب آخر نشاط</option>
                <option value="newest">حسب الأحدث تسجيلاً</option>
                <option value="most_sales">الأكثر مبيعاً</option>
                <option value="most_products">الأكثر منتجات</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">قائمة المستخدمين ({filteredAndSortedUsers.length})</h3>
              <button
                onClick={() => exportTableToPDF('users-table', 'سجل_المستخدمين')}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>تحميل PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="users-table" className="w-full text-right">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm">
                  <tr>
                    <th className="px-6 py-4 font-bold">المستخدم</th>
                    <th className="px-6 py-4 font-bold">التواصل</th>
                    <th className="px-6 py-4 font-bold">المنتجات / المبيعات</th>
                    <th className="px-6 py-4 font-bold">الاشتراك</th>
                    <th className="px-6 py-4 font-bold">التسجيل / آخر نشاط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredAndSortedUsers.map((u) => {
                    const daysRemaining = Math.max(0, Math.ceil((new Date(u.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 dark:text-white">{u.full_name}</div>
                          <div className="text-xs text-gray-500 font-mono mt-1">{u.id.substring(0, 8)}...</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">{u.email}</div>
                          <div className="text-sm text-gray-500">{u.phone || 'لا يوجد رقم'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-4">
                            <div className="text-center">
                              <div className="text-xs text-gray-500">منتجات</div>
                              <div className="font-bold text-brand-primary">{u.products_count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">مبيعات</div>
                              <div className="font-bold text-emerald-600">{u.sales_count}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={cn(
                              "inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs font-bold",
                              u.subscription_plan === 'trial' ? "bg-yellow-50 text-yellow-600" :
                              u.subscription_plan === 'monthly' ? "bg-blue-50 text-blue-600" :
                              u.subscription_plan === 'annual' ? "bg-purple-50 text-purple-600" :
                              "bg-emerald-50 text-emerald-600"
                            )}>
                              {u.subscription_plan === 'trial' ? 'فترة تجريبية' :
                               u.subscription_plan === 'monthly' ? 'شهري' :
                               u.subscription_plan === 'annual' ? 'سنوي' :
                               u.subscription_plan === 'lifetime' ? 'مدى الحياة' : u.subscription_plan}
                            </span>
                            <span className={cn(
                              "text-xs font-bold",
                              daysRemaining > 0 ? "text-gray-500" : "text-red-500"
                            )}>
                              {daysRemaining > 0 ? `متبقي ${daysRemaining} يوم` : 'منتهي الصلاحية'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            <span className="text-xs text-gray-500 ml-1">سجل:</span>
                            {new Date(u.created_at).toLocaleDateString('ar-EG')}
                          </div>
                          <div className="text-sm text-gray-900 dark:text-white mt-1">
                            <span className="text-xs text-gray-500 ml-1">نشط:</span>
                            {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('ar-EG') : 'غير معروف'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">لا يوجد مستخدمين</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'vouchers' ? (
        <div className="space-y-6">
          {/* Generate Voucher */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">توليد قسيمة جديدة</h2>
            <form onSubmit={generateVoucher} className="flex gap-4">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder={`المبلغ (${settings.currency})`}
                  value={newVoucherAmount}
                  onChange={(e) => setNewVoucherAmount(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isGenerating}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                توليد
              </button>
            </form>
          </div>

          {/* Vouchers List */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">سجل القسائم</h3>
              <button
                onClick={() => exportTableToPDF('vouchers-table', 'سجل_القسائم')}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>تحميل PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="vouchers-table" className="w-full text-right">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm">
                  <tr>
                    <th className="px-6 py-4 font-bold">الكود</th>
                    <th className="px-6 py-4 font-bold">المبلغ</th>
                    <th className="px-6 py-4 font-bold">الحالة</th>
                    <th className="px-6 py-4 font-bold">تاريخ التوليد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {vouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                          {v.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-brand-primary">{v.amount.toLocaleString()} {settings.currency}</td>
                      <td className="px-6 py-4">
                        {v.is_used ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            <XCircle className="w-3 h-3" /> مستخدمة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> صالحة
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(v.created_at).toLocaleDateString('ar-EG')}
                      </td>
                    </tr>
                  ))}
                  {vouchers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">لا توجد قسائم</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'subscription_vouchers' ? (
        <div className="space-y-6">
          {/* Generate Subscription Voucher */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">توليد قسيمة اشتراك جديدة</h2>
            <form onSubmit={generateSubVoucher} className="flex gap-4">
              <div className="flex-1">
                <select
                  value={newSubVoucherPlan}
                  onChange={(e) => setNewSubVoucherPlan(e.target.value as 'monthly' | 'annual')}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all font-bold"
                >
                  <option value="monthly">باقة شهرية (30 يوم)</option>
                  <option value="annual">باقة سنوية (365 يوم)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isGeneratingSub}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isGeneratingSub ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                توليد
              </button>
            </form>
          </div>

          {/* Subscription Vouchers List */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-white">سجل قسائم الاشتراك</h3>
              <button
                onClick={() => exportTableToPDF('sub-vouchers-table', 'سجل_قسائم_الاشتراك')}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>تحميل PDF</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table id="sub-vouchers-table" className="w-full text-right">
                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm">
                  <tr>
                    <th className="px-6 py-4 font-bold">الكود</th>
                    <th className="px-6 py-4 font-bold">نوع الباقة</th>
                    <th className="px-6 py-4 font-bold">الحالة</th>
                    <th className="px-6 py-4 font-bold">تاريخ التوليد</th>
                    <th className="px-6 py-4 font-bold">المستخدم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {subVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                          {v.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-brand-primary">
                        {v.plan_type === 'monthly' ? 'شهرية (30 يوم)' : 'سنوية (365 يوم)'}
                      </td>
                      <td className="px-6 py-4">
                        {v.is_used ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            <XCircle className="w-3 h-3" /> مستخدمة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            <CheckCircle className="w-3 h-3" /> صالحة
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(v.created_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {v.is_used && v.used_by_profile ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 dark:text-white">{v.used_by_profile.full_name}</span>
                            <span className="text-xs">{new Date(v.used_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                  {subVouchers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">لا توجد قسائم اشتراك</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {ads.map((ad) => (
            <div key={ad.id} className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col md:flex-row gap-6">
              {/* Ad Image */}
              <div className="w-full md:w-48 h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                {ad.image_url ? (
                  <img src={ad.image_url} alt="Ad" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-10 h-10 text-gray-400" />
                )}
              </div>

              {/* Ad Details */}
              <div className="flex-1 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">طلب إعلان جديد</h3>
                    <p className="text-sm text-gray-500">من: {ad.profiles?.name || 'تاجر'} ({ad.profiles?.phone || 'غير معروف'})</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1",
                    ad.status === 'pending' ? "bg-yellow-50 text-yellow-600" :
                    ad.status === 'active' ? "bg-emerald-50 text-emerald-600" :
                    ad.status === 'completed' ? "bg-gray-100 text-gray-600" :
                    "bg-red-50 text-red-600"
                  )}>
                    {ad.status === 'pending' && <Clock className="w-3 h-3" />}
                    {ad.status === 'active' && <CheckCircle className="w-3 h-3" />}
                    {ad.status === 'pending' ? 'قيد الانتظار' : ad.status === 'active' ? 'نشط' : ad.status === 'completed' ? 'مكتمل' : 'مرفوض'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                    <p className="text-gray-500 mb-1">الهدف</p>
                    <p className="font-bold text-gray-900 dark:text-white">{ad.goal}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl">
                    <p className="text-gray-500 mb-1">الميزانية والمدة</p>
                    <p className="font-bold text-gray-900 dark:text-white">{ad.budget} {settings.currency} / {ad.duration} أيام</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">النص الإعلاني:</p>
                  <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl whitespace-pre-wrap">
                    {ad.content_text}
                  </p>
                </div>

                {ad.target_url && (
                  <div>
                    <a href={ad.target_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-4 h-4" /> رابط التوجيه
                    </a>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {ad.status === 'pending' && (
                    <>
                      <button 
                        onClick={() => updateAdStatus(ad.id, 'active')}
                        disabled={updatingAdId === ad.id}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                      >
                        تفعيل الإعلان
                      </button>
                      <button 
                        onClick={() => updateAdStatus(ad.id, 'rejected')}
                        disabled={updatingAdId === ad.id}
                        className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                      >
                        رفض
                      </button>
                    </>
                  )}
                  {ad.status === 'active' && (
                    <button 
                      onClick={() => updateAdStatus(ad.id, 'completed')}
                      disabled={updatingAdId === ad.id}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                    >
                      تحديد كمكتمل
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {ads.length === 0 && (
            <div className="text-center py-20 text-gray-500">لا توجد طلبات إعلانات</div>
          )}
        </div>
      )}
    </div>
  );
}
