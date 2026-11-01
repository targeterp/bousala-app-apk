import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { Shield, UserPlus, StopCircle, CheckCircle2, AlertCircle, Loader2, Key, Users, RefreshCw, Trash2 } from 'lucide-react';
import { sanitizePhoneNumber } from '../utils';

// A secondary Supabase client that doesn't persist sessions.
// We use this to sign up employees without logging out the store owner.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const adminAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

const AVAILABLE_PAGES = [
  { id: '/sales', name: 'نقاط البيع (الكاشير)' },
  { id: '/products', name: 'المنتجات والمخزون' },
  { id: '/inventory', name: 'المخزون التفصيلي' },
  { id: '/customers', name: 'العملاء' },
  { id: '/suppliers', name: 'الموردين' },
  { id: '/expenses', name: 'المصروفات' },
  { id: '/custom-orders', name: 'الإنتاج والطلبات' },
  { id: '/finance', name: 'المالية' },
  { id: '/marketing', name: 'التسويق' },
  { id: '/reports', name: 'التقارير' }
];

interface TeamMember {
  id: string;
  user_id: string;
  access_role: 'seller' | 'accountant' | 'custom';
  permissions?: string[];
  is_active: boolean;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

export function TeamManagement() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({
    fullName: '',
    phone: '',
    password: '',
    role: 'seller' as 'seller' | 'accountant' | 'custom',
    permissions: [] as string[]
  });

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      setIsLoading(true);
      // Get the current tenant_id (the owner)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user.id;

      const { data, error } = await supabase
        .from('store_user_access')
        .select(`
          id,
          user_id,
          access_role,
          permissions,
          is_active,
          created_at
        `)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      
      const rawMembers = data || [];
      
      let profilesMap: Record<string, string> = {};
      if (rawMembers.length > 0) {
        const userIds = rawMembers.map(m => m.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
          
        if (profilesData) {
          profilesMap = profilesData.reduce((acc: any, p: any) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {});
        }
      }

      const membersWithProfiles = rawMembers.map(m => ({
        ...m,
        profiles: { full_name: profilesMap[m.user_id] || 'موظف مجهول' }
      }));

      setMembers(membersWithProfiles as any);

      // Auto-sync existing sub-accounts in the background so previously created accounts are updated immediately
      if (rawMembers.length > 0) {
        const memberIds = rawMembers.map(m => m.user_id);
        syncTeamSubscriptions(true, memberIds);
      }
    } catch (err: any) {
      console.error('Error fetching team members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const syncTeamSubscriptions = async (silent = false, customMemberIds?: string[]) => {
    try {
      if (!silent) setIsSyncing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const ownerId = tenantIdData || user.id;

      // 1. Fetch store owner's subscription
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('subscription_plan, subscription_end_date')
        .eq('id', ownerId)
        .maybeSingle();

      const endDate = ownerProfile?.subscription_end_date;

      // 2. Try calling RPC sync_store_sub_accounts
      let rpcSucceeded = false;
      try {
        const { error: rpcErr } = await supabase.rpc('sync_store_sub_accounts', { p_tenant_id: ownerId });
        if (!rpcErr) rpcSucceeded = true;
      } catch (e) {
        console.warn('RPC sync_store_sub_accounts error, using fallback:', e);
      }

      // 3. Fallback direct update for all team members
      const targetIds = customMemberIds || members.map(m => m.user_id);
      if (!rpcSucceeded && targetIds.length > 0) {
        await supabase
          .from('profiles')
          .update({
            subscription_plan: 'sub_account',
            subscription_end_date: endDate || null
          })
          .in('id', targetIds);
      }

      if (!silent) {
        toast.success('تمت مزامنة وتمديد اشتراكات الفريق بنجاح');
        fetchTeamMembers();
      }
    } catch (err: any) {
      console.error('Error syncing team subscriptions:', err);
      if (!silent) toast.error('حدث خطأ أثناء مزامنة الاشتراكات');
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = sanitizePhoneNumber(newMember.phone);
    
    // Validate fields
    if (!cleanPhone || !newMember.password || !newMember.fullName.trim()) {
      setMessage({ type: 'error', text: 'يرجى تعبئة جميع الحقول المطلوبة' });
      return;
    }
    
    if (cleanPhone.length < 8) {
      setMessage({ type: 'error', text: 'يرجى إدخال رقم هاتف صحيح للموظف (8 أرقام على الأقل)' });
      return;
    }

    if (newMember.password.length < 6) {
      setMessage({ type: 'error', text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const dummyEmail = `${cleanPhone}@target-app.mr`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const ownerId = tenantIdData || session?.user.id;

      if (!ownerId) throw new Error('لا يوجد صلاحية للمالك');

      // Fetch owner subscription details to pass to sub-account
      const { data: ownerProf } = await supabase
        .from('profiles')
        .select('subscription_plan, subscription_end_date')
        .eq('id', ownerId)
        .maybeSingle();

      // 1. Create the user using the isolated secondary client
      const { data: authData, error: authError } = await adminAuthClient.auth.signUp({
        email: dummyEmail,
        password: newMember.password,
        options: {
          data: {
            name: newMember.fullName.trim(),
            full_name: newMember.fullName.trim(),
            phone: cleanPhone,
            is_sub_account: true,
            tenant_id: ownerId
          }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          throw new Error('رقم الهاتف هذا مسجل مسبقاً في النظام كموظف أو كمالك متجر');
        }
        throw authError;
      }

      if (!authData.user) throw new Error('فشل إنشاء حساب المستخدم');

      const employeeId = authData.user.id;

      // 2. Add the employee to the RBAC access table
      const { error: accessError } = await supabase
        .from('store_user_access')
        .insert([{
          user_id: employeeId,
          tenant_id: ownerId,
          access_role: newMember.role,
          permissions: newMember.role === 'custom' ? newMember.permissions : [],
          created_by: ownerId,
          is_active: true
        }]);

      if (accessError) throw accessError;

      // 3. Ensure employee's profile reflects sub_account status and store subscription
      try {
        await supabase
          .from('profiles')
          .update({
            full_name: newMember.fullName.trim(),
            subscription_plan: 'sub_account',
            subscription_end_date: ownerProf?.subscription_end_date || null,
            role: newMember.role
          })
          .eq('id', employeeId);
      } catch (profSyncErr) {
        console.warn('Profile sync note:', profSyncErr);
      }

      setMessage({ type: 'success', text: `تم إنشاء حساب (${newMember.role === 'seller' ? 'بائع' : newMember.role === 'accountant' ? 'محاسب' : 'مخصص'}) وتفعيل اشتراكه بنجاح` });
      setNewMember({ fullName: '', phone: '', password: '', role: 'seller', permissions: [] });
      setShowAddForm(false);
      fetchTeamMembers();
      
    } catch (err: any) {
      console.error('Error adding member:', err);
      setMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء إضافة الموظف' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMemberStatus = async (member: TeamMember) => {
    try {
      const { error } = await supabase
        .from('store_user_access')
        .update({ is_active: !member.is_active })
        .eq('id', member.id);

      if (error) throw error;
      fetchTeamMembers();
    } catch (err) {
      console.error('Error toggling member status:', err);
      toast.error('حدث خطأ أثناء تغيير حالة الموظف');
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (!window.confirm(`هل أنت متأكد من حذف الموظف (${member.profiles?.full_name || 'الموظف'}) من المتجر؟`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('store_user_access')
        .delete()
        .eq('id', member.id);

      if (error) throw error;
      toast.success('تم حذف الموظف من المتجر بنجاح');
      fetchTeamMembers();
    } catch (err: any) {
      console.error('Error deleting member:', err);
      toast.error('حدث خطأ أثناء حذف الموظف');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex flex-wrap gap-3 justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-primary" />
          إدارة فريق العمل والصلاحيات
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncTeamSubscriptions(false)}
            disabled={isSyncing}
            className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
            title="مزامنة وتمديد اشتراكات جميع الموظفين لتطابق اشتراك المتجر"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-brand-primary' : ''}`} />
            <span>مزامنة الاشتراكات</span>
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-brand-primary text-white hover:bg-brand-dark px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 text-sm shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            إضافة موظف
          </button>
        </div>
      </div>

      <div className="p-6">
        {message && (
          <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="font-bold">{message.text}</p>
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleAddMember} className="mb-8 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4">إنشاء حساب جديد لموظف</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={newMember.fullName}
                  onChange={e => setNewMember({...newMember, fullName: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="اسم الموظف"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">رقم هاتف الموظف (للدخول)</label>
                <input
                  type="text"
                  required
                  value={newMember.phone}
                  onChange={e => setNewMember({...newMember, phone: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="مثال: 41234567"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">كلمة المرور</label>
                <input
                  type="text"
                  required
                  value={newMember.password}
                  onChange={e => setNewMember({...newMember, password: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="كلمة المرور للموظف"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">الصلاحية والرتبة</label>
                <select
                  value={newMember.role}
                  onChange={e => setNewMember({...newMember, role: e.target.value as any})}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  <option value="seller">بائع / كاشير (نقاط بيع فقط)</option>
                  <option value="accountant">محاسب (تقارير وفواتير ومصروفات)</option>
                  <option value="custom">مخصص (تحديد الصلاحيات يدوياً)</option>
                </select>
              </div>
            </div>

            {newMember.role === 'custom' && (
              <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h4 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">حدد الصفحات المسموح الوصول إليها:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {AVAILABLE_PAGES.map(page => (
                    <label key={page.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                      <input 
                        type="checkbox"
                        checked={newMember.permissions.includes(page.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewMember({...newMember, permissions: [...newMember.permissions, page.id]});
                          } else {
                            setNewMember({...newMember, permissions: newMember.permissions.filter(id => id !== page.id)});
                          }
                        }}
                        className="w-4 h-4 text-brand-primary border-gray-300 rounded focus:ring-brand-primary"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{page.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-xl text-gray-600 font-bold hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء وحفظ الموظف'}
              </button>
            </div>
          </form>
        )}

        {members.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">لم تقم بإضافة أي موظفين للنظام بعد.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right" dir="rtl">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-500 text-sm">
                  <th className="py-3 px-4">اسم الموظف</th>
                  <th className="py-3 px-4">الرتبة</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">تاريخ الإضافة</th>
                  <th className="py-3 px-4">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                    <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">
                      {member.profiles?.full_name || 'موظف مجهول'}
                    </td>
                    <td className="py-4 px-4">
                      {member.access_role === 'seller' ? (
                        <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded-lg text-xs font-bold font-mono">
                          بائع / كاشير
                        </span>
                      ) : member.access_role === 'accountant' ? (
                        <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-3 py-1 rounded-lg text-xs font-bold font-mono">
                          محاسب
                        </span>
                      ) : (
                        <div className="relative group inline-block">
                          <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-3 py-1 rounded-lg text-xs font-bold font-mono cursor-help border border-orange-200 dark:border-orange-800">
                            مخصص (صلاحيات محددة)
                          </span>
                          <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-3">
                            <p className="text-xs font-bold text-gray-500 mb-2 border-b border-gray-100 dark:border-gray-700 pb-1">الصفحات المسموحة:</p>
                            <ul className="text-xs space-y-1">
                              {member.permissions && member.permissions.length > 0 ? (
                                member.permissions.map(pId => (
                                  <li key={pId} className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    {AVAILABLE_PAGES.find(p => p.id === pId)?.name || pId}
                                  </li>
                                ))
                              ) : (
                                <li className="text-gray-400">لا توجد صلاحيات</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {member.is_active ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1 text-sm">
                          <CheckCircle2 className="w-4 h-4" /> نشط
                        </span>
                      ) : (
                        <span className="text-red-500 font-bold flex items-center gap-1 text-sm">
                          <StopCircle className="w-4 h-4" /> موقوف
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-gray-500 text-sm">
                      {new Date(member.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMemberStatus(member)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            member.is_active 
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400' 
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400'
                          }`}
                        >
                          {member.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                        </button>
                        <button
                          onClick={() => handleDeleteMember(member)}
                          className="p-1.5 rounded-lg text-xs font-bold transition-colors bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                          title="حذف الموظف من المتجر"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
