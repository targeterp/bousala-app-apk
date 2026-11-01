import React, { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle, MessageCircle, Key, CheckCircle2, X, Lock } from 'lucide-react';

interface SubscriptionContextType {
  isExpired: boolean;
  isLoading: boolean;
  checkSubscription: () => Promise<void>;
  showRenewModal: boolean;
  setShowRenewModal: (show: boolean) => void;
}

export const SubscriptionContext = createContext<SubscriptionContextType>({
  isExpired: false,
  isLoading: true,
  checkSubscription: async () => {},
  showRenewModal: false,
  setShowRenewModal: () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false); // Optimistic loading
  const [isExpired, setIsExpired] = useState(localStorage.getItem('subscription_expired') === 'true');
  const [isSubAccount, setIsSubAccount] = useState(false);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [tenantBusinessName, setTenantBusinessName] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [hasShownInitialModal, setHasShownInitialModal] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  useEffect(() => {
    if (isExpired && !hasShownInitialModal && !isLoading) {
      setShowRenewModal(true);
      setHasShownInitialModal(true);
    }
  }, [isExpired, isLoading, hasShownInitialModal]);

  const checkSubscription = async () => {
    try {
      const storedExpiry = localStorage.getItem('subscription_expired');
      if (storedExpiry === 'true') {
        setIsExpired(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // 1. Super admin bypass
      const isSuperAdmin = session.user.email === 'infogrp.target@gmail.com' || session.user.email?.startsWith('47071347') || session.user.phone?.includes('47071347');
      if (isSuperAdmin) {
        setIsExpired(false);
        setIsSubAccount(false);
        localStorage.setItem('subscription_expired', 'false');
        setIsLoading(false);
        return;
      }

      // 2. Check if current user is an employee / sub-account in store_user_access
      let finalTenantId = userId;
      let isSub = false;

      const { data: accessData } = await supabase
        .from('store_user_access')
        .select('tenant_id, access_role, is_active')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (accessData && accessData.tenant_id && accessData.tenant_id !== userId) {
        isSub = true;
        setIsSubAccount(true);
        finalTenantId = accessData.tenant_id;
        localStorage.setItem('target_tenant_id', finalTenantId);

        // If deactivated by store owner, block access immediately
        if (accessData.is_active === false) {
          setIsDeactivated(true);
          setIsExpired(true);
          localStorage.setItem('subscription_expired', 'true');
          setIsLoading(false);
          return;
        }
      } else {
        setIsSubAccount(false);
        localStorage.setItem('target_tenant_id', userId);
      }

      // 3. Fetch store subscription from tenant profile (or RPC)
      let storeProfile: any = null;

      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id, subscription_end_date, subscription_plan, role, business_name, full_name')
        .eq('id', finalTenantId)
        .maybeSingle();

      if (profileData && !profileErr) {
        storeProfile = profileData;
        if (profileData.business_name) {
          setTenantBusinessName(profileData.business_name);
        }
      } else {
        // Fallback: Use security definer RPC
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('get_store_subscription_status');
          if (rpcData && !rpcErr) {
            storeProfile = rpcData;
            if (rpcData.business_name) {
              setTenantBusinessName(rpcData.business_name);
            }
            if (rpcData.is_deactivated) {
              setIsDeactivated(true);
              setIsExpired(true);
              localStorage.setItem('subscription_expired', 'true');
              setIsLoading(false);
              return;
            }
          }
        } catch (rpcEx) {
          console.warn('RPC subscription check error:', rpcEx);
        }
      }

      setProfile(storeProfile);

      // 4. Calculate validity based on Store's subscription
      if (storeProfile && storeProfile.subscription_end_date) {
        const endDate = new Date(storeProfile.subscription_end_date);
        if (endDate < new Date()) {
          setIsExpired(true);
          localStorage.setItem('subscription_expired', 'true');
        } else {
          setIsExpired(false);
          localStorage.setItem('subscription_expired', 'false');
          // Auto-heal existing sub-account profile in background
          if (isSub && userId && storeProfile.subscription_end_date) {
            supabase
              .from('profiles')
              .update({
                subscription_plan: 'sub_account',
                subscription_end_date: storeProfile.subscription_end_date
              })
              .eq('id', userId)
              .then();
          }
        }
      } else if (storeProfile && storeProfile.is_expired !== undefined) {
        setIsExpired(Boolean(storeProfile.is_expired));
        localStorage.setItem('subscription_expired', storeProfile.is_expired ? 'true' : 'false');
      } else {
        // If it is a sub-account and no tenant subscription found, set expired; for owner default to not expired yet
        if (isSub) {
          setIsExpired(true);
          localStorage.setItem('subscription_expired', 'true');
        } else {
          setIsExpired(false);
          localStorage.setItem('subscription_expired', 'false');
        }
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;

    setIsRedeeming(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error } = await supabase.rpc('redeem_subscription_voucher', {
        p_voucher_code: voucherCode.trim()
      });

      if (error) throw error;

      if (data.success) {
        setSuccess(data.message);
        setVoucherCode('');
        // Re-check subscription after 2 seconds
        setTimeout(() => {
          checkSubscription();
          setShowRenewModal(false);
        }, 2000);
      } else {
        setError(data.message || 'رمز القسيمة غير صحيح أو مستخدم مسبقاً');
      }
    } catch (err: any) {
      console.error('Error redeeming voucher:', err);
      setError(err.message || 'حدث خطأ أثناء تفعيل القسيمة');
    } finally {
      setIsRedeeming(false);
    }
  };

  // Removed full-screen loader to allow optimistic rendering
  // Background processes will update the state


  return (
    <SubscriptionContext.Provider value={{ isExpired, isLoading, checkSubscription, showRenewModal, setShowRenewModal }}>
      {isExpired && (
        <div className={`fixed top-0 left-0 right-0 z-[60] text-white px-4 py-2.5 flex items-center justify-center shadow-md ${
          isDeactivated ? 'bg-gradient-to-r from-red-600 to-rose-600' : 'bg-gradient-to-r from-amber-500 to-orange-500'
        }`} dir="rtl">
          <div className="flex items-center gap-3 max-w-4xl w-full">
            <Lock className="w-5 h-5 shrink-0" />
            <p className="font-medium text-sm md:text-base flex-1">
              {isDeactivated
                ? `تم تعطيل وصول هذا الحساب إلى متجر (${tenantBusinessName || 'المتجر'}) من قبل الإدارة.`
                : isSubAccount
                ? `انتهت فترة اشتراك متجر (${tenantBusinessName || 'المتجر الرئيسي'}). يرجى إبلاغ مالك المتجر لتجديد الاشتراك.`
                : 'انتهت فترة الاشتراك. التطبيق يعمل الآن في وضع الاستعراض فقط. يرجى تجديد الاشتراك لمتابعة إدارة أعمالك.'}
            </p>
            <button 
              onClick={() => setShowRenewModal(true)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shrink-0 shadow-sm ${
                isDeactivated
                  ? 'bg-white text-red-600 hover:bg-red-50'
                  : 'bg-white text-orange-600 hover:bg-orange-50'
              }`}
            >
              {isDeactivated ? 'تفاصيل الحساب' : isSubAccount ? 'تفاصيل الاشتراك' : 'تجديد الاشتراك'}
            </button>
          </div>
        </div>
      )}

      {/* Add padding top if expired to prevent content from hiding behind the fixed banner */}
      <div className={isExpired ? "pt-[52px] md:pt-[56px] min-h-screen" : "min-h-screen"}>
        {children}
      </div>

      {showRenewModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isDeactivated
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                }`}>
                  {isDeactivated ? <AlertCircle className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {isDeactivated 
                    ? 'حساب موظف معطل' 
                    : isSubAccount 
                    ? `اشتراك متجر (${tenantBusinessName || 'المتجر الرئيسي'})` 
                    : 'تجديد الاشتراك'}
                </h2>
              </div>
              <button 
                onClick={() => setShowRenewModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">
                {isDeactivated ? (
                  'تم إيقاف تفعيل هذا الحساب الفرعي بواسطة مالك المتجر. لا يمكنك تسجيل مبيعات أو تصفح بيانات المتجر حالياً. يرجى التواصل مع إدارة المتجر لإعادة التفعيل.'
                ) : isSubAccount ? (
                  `هذا الحساب الفرعي مرتبط بمتجر (${tenantBusinessName || 'المتجر الرئيسي'}). لقد انتهت فترة اشتراك المتجر، وتجديد الاشتراك يعيد التفعيل تلقائياً لجميع أفراد الفريق.`
                ) : (
                  'عذراً، لا يمكنك تنفيذ هذا الإجراء لأن فترة اشتراكك قد انتهت. يرجى تفعيل قسيمة اشتراك جديدة للمتابعة.'
                )}
              </p>

              {!isDeactivated && (
                <form onSubmit={handleRedeem} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      {isSubAccount ? 'لديك قسيمة لتجديد اشتراك المتجر؟' : 'لديك قسيمة اشتراك؟'}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <Key className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value)}
                        className="block w-full pl-3 pr-10 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all"
                        placeholder="أدخل رمز القسيمة هنا..."
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-start gap-2 text-sm font-bold border border-red-100 dark:border-red-800">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-xl flex items-start gap-2 text-sm font-bold border border-green-100 dark:border-green-800">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>{success}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isRedeeming || !voucherCode.trim()}
                    className="w-full bg-brand-primary hover:bg-brand-dark text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isRedeeming ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تفعيل القسيمة'}
                  </button>
                </form>
              )}

              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
                  {isDeactivated 
                    ? 'يرجى مراجعة إدارة المتجر لتفعيل حسابك' 
                    : 'للحصول على قسيمة اشتراك جديدة، تواصل معنا عبر واتساب'}
                </p>
                {!isDeactivated && (
                  <a
                    href="https://wa.me/22247071310?text=مرحباً، أريد شراء قسيمة اشتراك لتطبيق بوصلة."
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20"
                  >
                    <MessageCircle className="w-5 h-5" />
                    شراء قسيمة عبر واتساب
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </SubscriptionContext.Provider>
  );
}
