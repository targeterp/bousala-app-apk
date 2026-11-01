import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Building, Save, Loader2, AlertCircle, CheckCircle2, Settings as SettingsIcon, Receipt, MapPin, Phone, DollarSign, Percent, Download, Store, Link as LinkIcon, Image as ImageIcon, MessageCircle, Lock } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useSubscription } from '../components/SubscriptionGuard';
import { useNavigate } from 'react-router-dom';

import { TeamManagement } from '../components/TeamManagement';

export function Settings() {
  const { settings, updateSettings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{ plan: string, endDate: string | null }>({ plan: 'trial', endDate: null });
  const [voucherCode, setVoucherCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  
  const [profile, setProfile] = useState({
    fullName: '',
    businessName: '',
    email: '',
    phone: ''
  });

  const [appSettings, setAppSettings] = useState({
    currency: settings.currency,
    taxRate: settings.taxRate,
    taxNumber: settings.taxNumber,
    receiptHeader: settings.receiptHeader,
    receiptFooter: settings.receiptFooter,
    storeAddress: settings.storeAddress,
    storePhone: settings.storePhone,
    storeSlug: settings.storeSlug || '',
    storeLogo: settings.storeLogo || '',
    themeColor: settings.themeColor || '#3b82f6',
    announcementBar: settings.announcementBar || '',
    socialLinks: settings.socialLinks || '',
  });

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && (data === 'seller' || data === 'accountant')) {
        navigate('/');
      } else {
        fetchProfile();
      }
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [navigate]);

  useEffect(() => {
    setAppSettings({
      currency: settings.currency,
      taxRate: settings.taxRate,
      taxNumber: settings.taxNumber,
      receiptHeader: settings.receiptHeader,
      receiptFooter: settings.receiptFooter,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeSlug: settings.storeSlug || '',
      storeLogo: settings.storeLogo || '',
      themeColor: settings.themeColor || '#3b82f6',
      announcementBar: settings.announcementBar || '',
      socialLinks: settings.socialLinks || '',
    });
  }, [settings]);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      
      if (user) {
        setUserId(user.id);
        setProfile({
          fullName: user.user_metadata?.full_name || '',
          businessName: user.user_metadata?.business_name || '',
          email: user.email || '',
          phone: user.phone || ''
        });

        const { data: profileData } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_end_date')
          .eq('id', user.id)
          .single();
          
        if (profileData) {
          setSubscription({
            plan: profileData.subscription_plan || 'trial',
            endDate: profileData.subscription_end_date
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;

    setIsRedeeming(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('redeem_subscription_voucher', {
        p_voucher_code: voucherCode.trim()
      });

      if (error) throw error;

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setVoucherCode('');
        fetchProfile(); // Refresh subscription data
      } else {
        setMessage({ type: 'error', text: data.message || 'رمز القسيمة غير صحيح أو مستخدم مسبقاً' });
      }
    } catch (err: any) {
      console.error('Error redeeming voucher:', err);
      setMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء تفعيل القسيمة' });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    setIsSaving(true);
    setMessage(null);
    
    // Validate store slug (only english letters, numbers, and hyphens)
    const slugRegex = /^[a-z0-9-]+$/;
    if (appSettings.storeSlug && !slugRegex.test(appSettings.storeSlug)) {
      setMessage({ type: 'error', text: 'رابط المتجر يجب أن يحتوي على أحرف إنجليزية وأرقام وشرطات (-) فقط' });
      setIsSaving(false);
      return;
    }

    try {
      await updateSettings({
        currency: appSettings.currency,
        taxRate: Number(appSettings.taxRate),
        taxNumber: appSettings.taxNumber,
        receiptHeader: appSettings.receiptHeader,
        receiptFooter: appSettings.receiptFooter,
        storeAddress: appSettings.storeAddress,
        storePhone: appSettings.storePhone,
        storeSlug: appSettings.storeSlug,
        storeLogo: appSettings.storeLogo,
        themeColor: appSettings.themeColor,
        announcementBar: appSettings.announcementBar,
        socialLinks: appSettings.socialLinks,
      });

      const { error: profileError } = await supabase.auth.updateUser({
        data: {
          full_name: profile.fullName,
          business_name: profile.businessName
        }
      });
      
      if (profileError) throw profileError;

      // Update public profiles table for storefront access
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user.id) {
        const { error: publicProfileError } = await supabase.from('profiles').update({
          full_name: profile.fullName,
          business_name: profile.businessName,
          store_phone: appSettings.storePhone,
          store_slug: appSettings.storeSlug || null,
          store_logo: appSettings.storeLogo || null,
          theme_color: appSettings.themeColor || null,
          announcement_bar: appSettings.announcementBar || null,
          social_links: appSettings.socialLinks || null
        }).eq('id', sessionData.session.user.id);
        
        if (publicProfileError) {
          console.warn('Could not update public profile columns. They might not exist yet.', publicProfileError);
          // We don't throw here to avoid blocking the user, but we show a specific message
          setMessage({ type: 'success', text: 'تم حفظ الإعدادات، لكن إعدادات المتجر العام تتطلب تحديث قاعدة البيانات.' });
          setIsSaving(false);
          return;
        }
      }
      
      setMessage({ type: 'success', text: 'تم حفظ الإعدادات بنجاح' });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      setMessage({ type: 'error', text: error.message || 'حدث خطأ أثناء حفظ الإعدادات' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      toast.error('التطبيق مثبت بالفعل أو أن متصفحك لا يدعم هذه الميزة.');
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-brand-primary" />
        <p className="font-medium">جاري تحميل الإعدادات...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">الإعدادات</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">إدارة ملفك الشخصي وإعدادات التطبيق.</p>
        </div>
        {deferredPrompt && (
          <button
            type="button"
            onClick={handleInstallClick}
            className="bg-brand-primary hover:bg-brand-primary/90 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center gap-2 text-sm shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>تثبيت التطبيق</span>
          </button>
        )}
      </div>

      <form onSubmit={handleSaveProfile} className="space-y-8">
        {message && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="font-bold">{message.text}</p>
          </div>
        )}

        {/* Subscription Status */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-brand-primary" />
              حالة الاشتراك
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">الباقة الحالية</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-gray-900 dark:text-white">
                    {subscription.plan === 'trial' ? 'فترة تجريبية' : subscription.plan === 'monthly' ? 'باقة شهرية' : 'باقة سنوية'}
                  </span>
                  {subscription.endDate && new Date(subscription.endDate) > new Date() ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold rounded-full">
                      نشط
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold rounded-full">
                      منتهي
                    </span>
                  )}
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">تاريخ الانتهاء</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white" dir="ltr">
                  {subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('ar-EG') : 'غير محدد'}
                </p>
                {subscription.endDate && (
                  <p className="text-xs text-brand-primary font-bold mt-1">
                    {Math.max(0, Math.ceil((new Date(subscription.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} يوم متبقي
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">تجديد الاشتراك</h3>
                <a 
                  href="https://wa.me/22247071310?text=مرحباً،%20أود%20تفعيل%20اشتراكي%20في%20تطبيق%20بوصلة."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-green-600 hover:text-green-700 flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  تواصل لتفعيل الاشتراك
                </a>
              </div>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value)}
                    placeholder="أدخل رمز قسيمة الاشتراك هنا..."
                    className="w-full pl-4 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    dir="ltr"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRedeemVoucher}
                  disabled={isRedeeming || !voucherCode.trim()}
                  className="bg-brand-primary hover:bg-brand-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                >
                  {isRedeeming ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تفعيل القسيمة'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <User className="w-6 h-6 text-brand-primary" />
              الملف الشخصي للتاجر
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  الاسم الكامل
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={profile.fullName}
                    onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="أدخل اسمك الكامل"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  اسم النشاط التجاري (المتجر)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Building className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={profile.businessName}
                    onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="أدخل اسم متجرك"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  البريد الإلكتروني / رقم الهاتف (للدخول)
                </label>
                <input
                  type="text"
                  value={profile.email || profile.phone}
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-2">لا يمكن تغيير بيانات الدخول من هنا.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-brand-primary" />
              إعدادات التطبيق
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  العملة الافتراضية
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={appSettings.currency}
                    onChange={(e) => setAppSettings({ ...appSettings, currency: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="مثال: MRU, USD, SAR"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  نسبة الضريبة (%)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Percent className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={appSettings.taxRate === 0 ? '' : appSettings.taxRate}
                    onChange={(e) => setAppSettings({ ...appSettings, taxRate: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  الرقم الضريبي (إن وجد)
                </label>
                <input
                  type="text"
                  value={appSettings.taxNumber}
                  onChange={(e) => setAppSettings({ ...appSettings, taxNumber: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                  placeholder="أدخل الرقم الضريبي للمتجر"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Store className="w-6 h-6 text-brand-primary" />
              إعدادات المتجر الإلكتروني
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  شعار المتجر (Logo)
                </label>
                <div className="flex flex-col gap-3">
                  {appSettings.storeLogo && (
                    <div className="w-24 h-24 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white flex items-center justify-center p-2">
                      <img src={appSettings.storeLogo} alt="Store Logo" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-primary dark:hover:border-brand-primary px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      <span>{appSettings.storeLogo ? 'تغيير الشعار' : 'رفع شعار'}</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 1024 * 1024) { // 1MB max
                               setMessage({ type: 'error', text: 'حجم الصورة يجب أن لا يتجاوز 1 ميجابايت' });
                               return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setAppSettings({ ...appSettings, storeLogo: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          }
                        }} 
                      />
                    </label>
                    {appSettings.storeLogo && (
                      <button 
                        type="button"
                        onClick={() => setAppSettings({ ...appSettings, storeLogo: '' })}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-xl text-sm font-bold transition-colors"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  لون المتجر الرئيسي
                </label>
                <input
                  type="color"
                  value={appSettings.themeColor}
                  onChange={(e) => setAppSettings({ ...appSettings, themeColor: e.target.value })}
                  className="w-full h-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  شريط الإعلانات (Announcement Bar)
                </label>
                <input
                  type="text"
                  value={appSettings.announcementBar}
                  onChange={(e) => setAppSettings({ ...appSettings, announcementBar: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                  placeholder="مثال: توصيل مجاني للطلبات فوق  1500 أوقية"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  روابط التواصل الاجتماعي (JSON)
                </label>
                <input
                  type="text"
                  value={appSettings.socialLinks}
                  onChange={(e) => setAppSettings({ ...appSettings, socialLinks: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                  placeholder='{"instagram": "...", "tiktok": "..."}'
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  رابط المتجر (Slug)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <LinkIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={appSettings.storeSlug}
                    onChange={(e) => setAppSettings({ ...appSettings, storeSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="مثال: my-store"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  رابط متجرك سيكون: {window.location.origin}/store/{appSettings.storeSlug || '...'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  رقم هاتف المتجر (للطلبات عبر واتساب)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={appSettings.storePhone}
                    onChange={(e) => setAppSettings({ ...appSettings, storePhone: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="أدخل رقم الهاتف مع رمز الدولة (مثال: 22233445566)"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-6 h-6 text-brand-primary" />
              إعدادات الفاتورة (الإيصال)
            </h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  عنوان المتجر
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={appSettings.storeAddress}
                    onChange={(e) => setAppSettings({ ...appSettings, storeAddress: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="أدخل عنوان المتجر"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  رقم هاتف المتجر
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={appSettings.storePhone}
                    onChange={(e) => setAppSettings({ ...appSettings, storePhone: e.target.value })}
                    className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    placeholder="أدخل رقم الهاتف"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  نص ترويسة الفاتورة (أعلى)
                </label>
                <input
                  type="text"
                  value={appSettings.receiptHeader}
                  onChange={(e) => setAppSettings({ ...appSettings, receiptHeader: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                  placeholder="مثال: متجر الهدف للتسوق"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  نص تذييل الفاتورة (أسفل)
                </label>
                <input
                  type="text"
                  value={appSettings.receiptFooter}
                  onChange={(e) => setAppSettings({ ...appSettings, receiptFooter: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                  placeholder="مثال: شكراً لتسوقكم معنا!"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-brand-primary hover:bg-brand-dark text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            حفظ التغييرات
          </button>
        </div>
      </form>

      {/* Team Management Section (RBAC) */}
      <TeamManagement />
    </div>
  );
}
