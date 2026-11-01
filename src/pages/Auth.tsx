import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Target, Phone, Lock, User, Briefcase, Mail, Loader2, AlertCircle } from 'lucide-react';
import { cn, sanitizePhoneNumber } from '../utils';
import { Logo } from '../components/Logo';

export function Auth() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'signup');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLogin(searchParams.get('mode') !== 'signup');
  }, [searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanedPhone = sanitizePhoneNumber(phone);

    // Basic phone validation (Mauritania numbers are typically 8 digits)
    if (cleanedPhone.length < 8) {
      setError('يرجى إدخال رقم هاتف صحيح مكون من 8 أرقام على الأقل');
      setIsLoading(false);
      return;
    }

    // We use a dummy email based on the cleaned phone number
    const dummyEmail = `${cleanedPhone}@target-app.mr`;

    try {
      if (isLogin) {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: dummyEmail,
          password,
        });
        if (error) throw error;

        // Reset any stale expired flag from previous user
        localStorage.removeItem('subscription_expired');

        if (signInData?.user) {
          // Check if employee
          const { data: accessData } = await supabase
            .from('store_user_access')
            .select('tenant_id, is_active')
            .eq('user_id', signInData.user.id)
            .limit(1)
            .maybeSingle();

          if (accessData) {
            if (!accessData.is_active) {
              await supabase.auth.signOut();
              throw new Error('تم تعطيل هذا الحساب من قبل مدير المتجر. يرجى مراجعة إدارة المتجر.');
            }
            localStorage.setItem('target_tenant_id', accessData.tenant_id);
          } else {
            localStorage.setItem('target_tenant_id', signInData.user.id);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: dummyEmail,
          password,
          options: {
            data: {
              name,
              business_name: businessName,
              real_email: email,
              phone,
            },
          },
        });
        if (error) throw error;
        
        if (data?.user) {
          const trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + 7);
          
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: name || 'مستخدم',
            role: 'admin',
            subscription_plan: 'trial',
            subscription_end_date: trialEndDate.toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.message === 'Invalid login credentials') {
        setError('رقم الهاتف أو كلمة المرور غير صحيحة');
      } else if (err.message === 'User already registered') {
        setError('رقم الهاتف مسجل مسبقاً');
      } else {
        setError(err.message || 'حدث خطأ أثناء المصادقة');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4" dir="rtl">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="bg-brand-dark p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-brand-primary/20 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-brand-dark">
              <Logo className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">بوصلة</h1>
            <p className="text-white/80 mt-2 font-medium">
              {isLogin ? 'مرحباً بعودتك! سجل دخولك للمتابعة' : 'أنشئ حسابك وابدأ في إدارة مبيعاتك'}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3 text-sm font-bold border border-red-100 dark:border-red-800">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الاسم الكامل</label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      type="text" 
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                      placeholder="محمد أحمد"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم النشاط التجاري</label>
                  <div className="relative">
                    <Briefcase className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      type="text" 
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                      placeholder="متجر الأمل"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">البريد الإلكتروني (اختياري)</label>
                  <div className="relative">
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-left"
                      placeholder="example@email.com"
                      dir="ltr"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="tel" 
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold text-left tracking-wider"
                  placeholder="4XXXXXXX"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium text-left"
                  placeholder="••••••••"
                  dir="ltr"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-sm shadow-brand-primary/20 flex items-center justify-center gap-2 mt-6 disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'تسجيل الدخول' : 'أنشئ حسابك')}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {isLogin ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
              <button 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="text-brand-primary font-bold mr-2 hover:underline"
              >
                {isLogin ? 'أنشئ حساباً جديداً' : 'سجل دخولك'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
