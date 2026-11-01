import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Megaphone, MessageCircle, Facebook, Wallet, 
  ArrowLeft, CheckCircle, Loader2, Image as ImageIcon,
  Sparkles, Users, Target, TrendingUp, AlertCircle, Clock, Lock
} from 'lucide-react';
import { cn } from '../utils';
import { useSettings } from '../contexts/SettingsContext';
import { useSubscription } from '../components/SubscriptionGuard';

export function Marketing() {
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { isExpired, setShowRenewModal } = useSubscription();
  const [activeTab, setActiveTab] = useState<'overview' | 'whatsapp' | 'facebook'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);

  // WhatsApp State
  const [waSegment, setWaSegment] = useState('all');
  const [waMessage, setWaMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Facebook Ads State
  const [voucherCode, setVoucherCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [adGoal, setAdGoal] = useState('messages');
  const [adText, setAdText] = useState('');
  const [adBudget, setAdBudget] = useState(500); // Currency per day
  const [adDuration, setAdDuration] = useState(3); // Days
  const [adLink, setAdLink] = useState('');
  const [isSubmittingAd, setIsSubmittingAd] = useState(false);
  const [adHistory, setAdHistory] = useState<any[]>([]);

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && (data === 'seller' || data === 'accountant')) {
        navigate('/');
      } else {
        fetchData();
      }
    });
  }, [navigate]);

  // Check for incoming product promotion state
  useEffect(() => {
    if (location.state?.productName) {
      setActiveTab('facebook');
      setAdText(`عرض خاص ومميز على منتجنا الرائع: ${location.state.productName}\nاستمتع بجودة عالية وتجربة فريدة. سارع بالطلب الآن! ✨`);
    }
  }, [location.state, location.state?.productName]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;
      if (!userId) return;

      // Fetch Wallet
      const { data: walletData, error: walletError } = await supabase.from('wallet').select('balance').eq('tenant_id', userId).maybeSingle();
      
      if (walletData) {
        setWalletBalance(walletData.balance);
      } else {
        // Create wallet if not exists
        await supabase.from('wallet').insert([{ tenant_id: userId, balance: 0 }]);
        setWalletBalance(0);
      }

      // Fetch Ad History
      const { data: adsData } = await supabase.from('facebook_ads').select('*').eq('tenant_id', userId).order('created_at', { ascending: false });
      if (adsData) setAdHistory(adsData);

    } catch (error) {
      console.error('Error fetching marketing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode) return;
    setIsRedeeming(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      // Check voucher
      const { data: voucher, error: voucherError } = await supabase
        .from('vouchers')
        .select('*')
        .eq('code', voucherCode)
        .eq('is_used', false)
        .single();

      if (voucherError || !voucher) {
        throw new Error('كود القسيمة غير صحيح أو مستخدم مسبقاً');
      }

      // Update voucher
      await supabase.from('vouchers').update({ 
        is_used: true, 
        used_by: userId, 
        used_at: new Date().toISOString() 
      }).eq('id', voucher.id);

      // Update wallet
      const newBalance = walletBalance + Number(voucher.amount);
      const { error: walletError } = await supabase.from('wallet').upsert({ 
        tenant_id: userId, 
        balance: newBalance,
        updated_at: new Date().toISOString()
      });

      if (walletError) throw walletError;
      
      setWalletBalance(newBalance);
      setVoucherCode('');
      toast.success(`تم شحن محفظتك بنجاح بمبلغ ${voucher.amount} ${settings.currency}!`);
    } catch (error: any) {
      console.error('Error redeeming voucher:', error);
      toast.error(error.message || 'حدث خطأ أثناء شحن القسيمة');
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleSubmitAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    const totalCost = adBudget * adDuration;
    
    if (walletBalance < totalCost) {
      toast.error(`رصيدك غير كافٍ. تكلفة الإعلان ${totalCost} ${settings.currency} ورصيدك ${walletBalance} ${settings.currency}.`);
      return;
    }

    setIsSubmittingAd(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      // Deduct from wallet
      const newBalance = walletBalance - totalCost;
      const { error: walletError } = await supabase.from('wallet').upsert({ 
        tenant_id: userId, 
        balance: newBalance,
        updated_at: new Date().toISOString()
      });

      if (walletError) throw walletError;

      // Create Ad Request
      const { error } = await supabase.from('facebook_ads').insert([{
        tenant_id: userId,
        goal: adGoal,
        content_text: adText,
        budget: totalCost,
        duration: adDuration,
        target_url: adLink,
        status: 'pending'
      }]);

      if (error) throw error;

      setWalletBalance(newBalance);
      setAdText('');
      setAdLink('');
      toast.success('تم إرسال طلب الإعلان بنجاح! سيتم مراجعته وإطلاقه قريباً.');
      fetchData(); // Refresh history
      
    } catch (error) {
      console.error('Error submitting ad:', error);
      toast.error('حدث خطأ أثناء إرسال الطلب');
    } finally {
      setIsSubmittingAd(false);
    }
  };

  const generateAIText = async () => {
    setIsGenerating(true);
    try {
      // Dummy timeout for now, replace with actual Gemini call if needed
      await new Promise(resolve => setTimeout(resolve, 1500));
      setWaMessage('مرحباً {الاسم} 👋\nلدينا عرض خاص لك اليوم! خصم 20% على جميع المنتجات لفترة محدودة.\nلا تفوت الفرصة وقم بزيارتنا الآن 🏃‍♂️✨');
    } catch (error) {
      console.error("Error generating text:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">مركز التسويق</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">أدوات ذكية لزيادة مبيعاتك والوصول لعملاء جدد.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 space-x-reverse border-b border-gray-200 dark:border-gray-800 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'overview' ? "border-brand-primary text-brand-primary" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Target className="w-4 h-4" /> دليلك للتسويق
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'whatsapp' ? "border-[#25D366] text-[#25D366]" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <MessageCircle className="w-4 h-4" /> تسويق واتساب (مجاني)
        </button>
        <button
          onClick={() => setActiveTab('facebook')}
          className={cn(
            "px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
            activeTab === 'facebook' ? "border-[#1877F2] text-[#1877F2]" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <Facebook className="w-4 h-4" /> إعلانات فيسبوك (ممولة)
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
        </div>
      ) : (
        <div className="mt-6">
          {/* --- Tab 1: Overview / Onboarding --- */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Hero */}
              <div className="bg-gradient-to-br from-brand-primary to-orange-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10 max-w-2xl">
                  <h2 className="text-3xl font-black mb-4">لماذا التسويق هو سر نجاحك؟</h2>
                  <p className="text-white/90 text-lg leading-relaxed mb-6">
                    المنتج الجيد لا يبيع نفسه! التسويق هو الجسر بينك وبين عملائك. من خلال أدواتنا، يمكنك إعادة استهداف عملائك الحاليين مجاناً عبر واتساب، أو الوصول لآلاف العملاء الجدد عبر إعلانات فيسبوك الممولة دون الحاجة لبطاقة بنكية دولية!
                  </p>
                  <button onClick={() => setActiveTab('facebook')} className="bg-white text-brand-primary px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors shadow-lg">
                    ابدأ حملتك الأولى الآن
                  </button>
                </div>
              </div>

              {/* Roadmap */}
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-8 text-center">كيف تعمل إعلانات فيسبوك معنا؟</h3>
                
                <div className="relative max-w-3xl mx-auto">
                  {/* Line */}
                  <div className="absolute right-[23px] top-0 bottom-0 w-1 bg-gray-100 dark:bg-gray-800 rounded-full"></div>
                  
                  <div className="space-y-8 relative">
                    {/* Step 1 */}
                    <div className="flex items-start gap-6">
                      <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-gray-900 z-10 shadow-sm">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <div className="pt-2">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">1. شحن المحفظة</h4>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                          تواصل معنا عبر واتساب (22247071347+) لدفع المبلغ بالعملة المحلية (Bankily, Masrvi). سنرسل لك "كود قسيمة" لتشحن به محفظتك في التطبيق.
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-6">
                      <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-gray-900 z-10 shadow-sm">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div className="pt-2">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">2. تجهيز الإعلان</h4>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                          اختر هدف الإعلان (رسائل، تفاعل)، اكتب النص الجذاب، وحدد الميزانية اليومية والمدة.
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex items-start gap-6">
                      <div className="w-12 h-12 bg-[#1877F2]/10 text-[#1877F2] rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-gray-900 z-10 shadow-sm">
                        <Facebook className="w-5 h-5" />
                      </div>
                      <div className="pt-2">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">3. إطلاق الحملة</h4>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                          سنقوم نحن بمراجعة طلبك وإطلاق الإعلان باحترافية من حساباتنا الإعلانية الموثقة، لتصل إلى آلاف العملاء المهتمين.
                        </p>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex items-start gap-6">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-gray-900 z-10 shadow-sm">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div className="pt-2">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">4. استقبال المبيعات</h4>
                        <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                          استعد لاستقبال رسائل العملاء الجدد وإتمام عمليات البيع عبر نقطة البيع (POS) في التطبيق!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- Tab 2: WhatsApp Marketing --- */}
          {activeTab === 'whatsapp' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-[#25D366]/10 text-[#25D366] rounded-xl flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">حملة واتساب جديدة</h2>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الشريحة المستهدفة</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setWaSegment('all')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all", waSegment === 'all' ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        جميع العملاء
                      </button>
                      <button onClick={() => setWaSegment('vip')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all", waSegment === 'vip' ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        كبار العملاء (VIP)
                      </button>
                      <button onClick={() => setWaSegment('debtors')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all", waSegment === 'debtors' ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        المديونون
                      </button>
                      <button onClick={() => setWaSegment('sleeping')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all", waSegment === 'sleeping' ? "border-[#25D366] bg-[#25D366]/5 text-[#25D366]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        العملاء الغائبون
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-bold text-gray-700 dark:text-gray-300">نص الرسالة</label>
                      <button onClick={generateAIText} disabled={isGenerating} className="text-xs font-bold text-purple-600 flex items-center gap-1 hover:bg-purple-50 px-2 py-1 rounded-lg transition-colors">
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        توليد بالذكاء الاصطناعي
                      </button>
                    </div>
                    <textarea
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      rows={6}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none transition-all resize-none"
                      placeholder="اكتب رسالتك هنا... استخدم {الاسم} ليتم استبدالها باسم العميل تلقائياً."
                    />
                    <p className="text-xs text-gray-500 mt-2">نصيحة: استخدم الإيموجي لجعل رسالتك أكثر جاذبية.</p>
                  </div>

                  <button className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-[#25D366]/20 flex items-center justify-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    بدء الإرسال المتسلسل
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">سجل حملات واتساب</h3>
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Clock className="w-12 h-12 opacity-20 mb-3" />
                  <p className="text-sm font-medium">لم تقم بإرسال أي حملات بعد</p>
                </div>
              </div>
            </div>
          )}

          {/* --- Tab 3: Facebook Ads --- */}
          {activeTab === 'facebook' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Wallet & History */}
              <div className="space-y-6">
                {/* Wallet Card */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full -z-10" />
                  <div className="flex items-center gap-2 text-gray-300 mb-2">
                    <Wallet className="w-5 h-5" />
                    <span className="text-sm font-bold">رصيد المحفظة الإعلانية</span>
                  </div>
                  <h2 className="text-4xl font-black mb-6">{walletBalance.toLocaleString()} <span className="text-lg text-gray-400">{settings.currency}</span></h2>
                  
                  <form onSubmit={handleRedeemVoucher} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="أدخل كود القسيمة..."
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-white/50 outline-none text-sm font-mono"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={isRedeeming}
                      className="bg-white text-gray-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      {isRedeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'شحن'}
                    </button>
                  </form>
                  
                  <div className="mt-5 pt-5 border-t border-white/10">
                    <p className="text-xs text-gray-400 mb-3 text-center">ليس لديك قسيمة شحن؟</p>
                    <a 
                      href="https://wa.me/22247071347?text=مرحباً، أريد شحن محفظتي الإعلانية في تطبيق بوصلة." 
                      target="_blank" 
                      rel="noreferrer"
                      className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20"
                    >
                      <MessageCircle className="w-4 h-4" />
                      طلب قسيمة عبر واتساب
                    </a>
                  </div>
                </div>

                {/* Ad History */}
                <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">طلباتي السابقة</h3>
                  <div className="space-y-3">
                    {adHistory.map(ad => (
                      <div key={ad.id} className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">{ad.budget} {settings.currency}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-xs font-bold",
                            ad.status === 'pending' ? "bg-yellow-100 text-yellow-700" :
                            ad.status === 'active' ? "bg-emerald-100 text-emerald-700" :
                            ad.status === 'completed' ? "bg-gray-200 text-gray-700" :
                            "bg-red-100 text-red-700"
                          )}>
                            {ad.status === 'pending' ? 'قيد المراجعة' : ad.status === 'active' ? 'نشط' : ad.status === 'completed' ? 'مكتمل' : 'مرفوض'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-1">{ad.content_text}</p>
                      </div>
                    ))}
                    {adHistory.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">لا توجد طلبات سابقة</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: New Ad Request Form */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-[#1877F2]/10 text-[#1877F2] rounded-xl flex items-center justify-center">
                    <Facebook className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">طلب إعلان ممول جديد</h2>
                    <p className="text-sm text-gray-500">سنقوم بإطلاق الإعلان نيابة عنك باحترافية.</p>
                  </div>
                </div>

                <form onSubmit={handleSubmitAd} className="space-y-5">
                  {/* Goal */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الهدف من الإعلان</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setAdGoal('messages')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-2", adGoal === 'messages' ? "border-[#1877F2] bg-[#1877F2]/5 text-[#1877F2]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        <MessageCircle className="w-5 h-5" /> رسائل واتساب
                      </button>
                      <button type="button" onClick={() => setAdGoal('engagement')} className={cn("p-3 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-2", adGoal === 'engagement' ? "border-[#1877F2] bg-[#1877F2]/5 text-[#1877F2]" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400")}>
                        <Users className="w-5 h-5" /> تفاعل ومتابعين
                      </button>
                    </div>
                  </div>

                  {/* Text */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">النص الإعلاني (الوصف)</label>
                    <textarea
                      value={adText}
                      onChange={(e) => setAdText(e.target.value)}
                      required
                      rows={4}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1877F2] focus:border-transparent outline-none transition-all resize-none"
                      placeholder="اكتب تفاصيل العرض والمنتج بشكل جذاب..."
                    />
                  </div>

                  {/* Image Upload (Mock for now) */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">صورة الإعلان</label>
                    <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
                      <ImageIcon className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-sm font-bold">اضغط لرفع صورة المنتج</p>
                      <p className="text-xs mt-1">JPG, PNG (يفضل مقاس مربع)</p>
                    </div>
                  </div>

                  {/* Budget & Duration */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الميزانية اليومية ({settings.currency})</label>
                      <input
                        type="number"
                        min="200"
                        step="100"
                        value={adBudget}
                        onChange={(e) => setAdBudget(Number(e.target.value))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1877F2] focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المدة (أيام)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={adDuration}
                        onChange={(e) => setAdDuration(Number(e.target.value))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1877F2] focus:border-transparent outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Link */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رابط التوجيه (اختياري)</label>
                    <input
                      type="url"
                      value={adLink}
                      onChange={(e) => setAdLink(e.target.value)}
                      placeholder="رابط صفحتك أو رقم واتساب..."
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1877F2] focus:border-transparent outline-none transition-all text-left"
                      dir="ltr"
                    />
                  </div>

                  {/* Summary & Submit */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-1">التكلفة الإجمالية</p>
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{(adBudget * adDuration).toLocaleString()} {settings.currency}</p>
                    </div>
                    <button 
                      type="submit"
                      disabled={isSubmittingAd || walletBalance < (adBudget * adDuration)}
                      className="bg-[#1877F2] hover:bg-[#166fe5] text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-[#1877F2]/20 flex items-center gap-2 disabled:opacity-50"
                    >
                      {isSubmittingAd ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إرسال الطلب'}
                    </button>
                  </div>
                  {walletBalance < (adBudget * adDuration) && (
                    <p className="text-red-500 text-xs font-bold text-center flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" /> رصيد المحفظة غير كافٍ. يرجى الشحن أولاً.
                    </p>
                  )}
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
