import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, ArrowLeft, MessageCircle, ShieldCheck, Zap, Globe } from 'lucide-react';
import { Logo } from '../components/Logo';

export function Pricing() {
  const WHATSAPP_NUMBER = "22247071310";
  const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('مرحباً، أود تفعيل اشتراكي في تطبيق بوصلة.')}`;

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-primary/20" dir="rtl">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
                <Logo className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black text-gray-900 font-mostaqbali">بوصلة</span>
            </Link>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
              <Link to="/#features" className="hover:text-brand-primary transition-colors">المميزات</Link>
              <Link to="/pricing" className="text-brand-primary font-bold transition-colors">الأسعار</Link>
              <Link to="/tutorial" className="hover:text-brand-primary transition-colors">كيف يعمل؟</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                تسجيل الدخول
              </Link>
              <Link to="/login?mode=signup" className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-secondary transition-colors">
                ابدء مجانا
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-6xl font-black text-gray-900 tracking-tight mb-6">
            أسعار بسيطة وشفافة <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">
              تناسب حجم أعمالك
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            اختر الباقة التي تناسبك واستمتع بجميع ميزات النظام بدون أي رسوم خفية.
          </p>
        </motion.div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Monthly Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden group"
          >
            <div className="absolute top-4 left-4 bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-black animate-pulse">
              خصم 30% لفترة محدودة
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -z-10 group-hover:bg-brand-primary/5 transition-colors"></div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">الاشتراك الشهري</h3>
            <p className="text-gray-500 mb-6">مرونة تامة ودفع شهري</p>
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl text-gray-400 line-through font-bold">500</span>
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">وفر 150</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black text-gray-900">350</span>
                <span className="text-lg text-gray-500 font-bold">أوقية جديدة</span>
                <span className="text-sm text-gray-400 font-medium mr-1">/ شهر</span>
              </div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                <span className="font-medium">جميع ميزات النظام بلا استثناء</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                <span className="font-medium">دعم فني متواصل عبر الواتساب</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <CheckCircle2 className="w-5 h-5 text-brand-primary" />
                <span className="font-medium">تحديثات دورية مجانية</span>
              </div>
            </div>
            <a 
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
            >
              <MessageCircle className="w-5 h-5" />
              تفعيل العرض الآن
            </a>
          </motion.div>

          {/* Annual Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="bg-brand-primary rounded-3xl p-8 border border-brand-secondary shadow-2xl shadow-brand-primary/30 relative overflow-hidden text-white group"
          >
            <div className="absolute top-4 left-4 bg-white/20 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
              الأكثر توفيراً (وفر 1200)
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-full -z-10 group-hover:bg-white/20 transition-colors"></div>
            <h3 className="text-2xl font-bold mb-2">الاشتراك السنوي</h3>
            <p className="text-white/80 mb-6">الخيار الأمثل للنمو المستدام</p>
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl text-white/50 line-through font-bold">4200</span>
                <span className="bg-white text-brand-primary text-[10px] px-1.5 py-0.5 rounded font-bold">وفر 30%</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-6xl font-black">3000</span>
                <span className="text-lg text-white/90 font-bold">أوقية جديدة</span>
                <span className="text-sm text-white/70 font-medium mr-1">/ سنة</span>
              </div>
            </div>
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-white">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">جميع ميزات النظام + ميزات حصرية</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">دعم فني VIP وأولوية في الرد</span>
              </div>
              <div className="flex items-center gap-3 text-white">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">توفير قيمة 4 أشهر مجانية</span>
              </div>
            </div>
            <a 
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 bg-white text-brand-primary rounded-xl font-bold text-lg hover:bg-gray-50 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-xl"
            >
              <MessageCircle className="w-5 h-5" />
              احصل على العرض السنوي
            </a>
          </motion.div>
        </div>
      </section>

      {/* Currency Translation & Payment Methods */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-gray-900 mb-4">طرق الدفع والعملات المدعومة</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              نوفر خيارات دفع متعددة تناسب الجميع، سواء كنت داخل موريتانيا أو خارجها.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Currencies */}
            <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <Globe className="w-8 h-8 text-brand-primary" />
                <h3 className="text-2xl font-bold text-gray-900">الأسعار بالعملات الأخرى</h3>
              </div>
              <p className="text-gray-600 mb-6 text-sm">الأسعار التقريبية (قد تختلف قليلاً حسب سعر الصرف):</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900">الدولار الأمريكي (USD)</span>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">شهري: ~$10</div>
                    <div className="font-bold text-brand-primary">سنوي: ~$85</div>
                  </div>
                </div>
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900">الدرهم المغربي (MAD)</span>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">شهري: ~100 درهم</div>
                    <div className="font-bold text-brand-primary">سنوي: ~850 درهم</div>
                  </div>
                </div>
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900">الدينار الجزائري (DZD)</span>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">شهري: ~1400 دينار</div>
                    <div className="font-bold text-brand-primary">سنوي: ~12000 دينار</div>
                  </div>
                </div>
                <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-gray-100">
                  <span className="font-bold text-gray-900">الدينار التونسي (TND)</span>
                  <div className="text-left">
                    <div className="text-sm text-gray-500">شهري: ~32 دينار</div>
                    <div className="font-bold text-brand-primary">سنوي: ~270 دينار</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-8 h-8 text-brand-primary" />
                <h3 className="text-2xl font-bold text-gray-900">طرق الدفع المتاحة</h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-primary"></span>
                    داخل موريتانيا
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed bg-white p-4 rounded-xl border border-gray-100">
                    نقبل الدفع عبر جميع التطبيقات البنكية المحلية لسهولة وسرعة التفعيل:
                    <br />
                    <span className="font-bold text-gray-900 mt-2 block">Bankily, Masrivi, Sadad, Amanty, Bimbank, وغيرها.</span>
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-primary"></span>
                    خارج موريتانيا
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed bg-white p-4 rounded-xl border border-gray-100">
                    للعملاء من الدول الأخرى، نوفر خيارات دفع عالمية وآمنة:
                    <br />
                    <span className="font-bold text-gray-900 mt-2 block flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      العملات الرقمية (USDT) عبر منصة Binance (بينانس)
                    </span>
                  </p>
                </div>
              </div>
              
              <div className="mt-8">
                <a 
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  تواصل معنا لمعرفة تفاصيل الدفع
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center">
              <Logo className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black font-mostaqbali">بوصلة</span>
          </div>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            الحل الأمثل لإدارة محلك التجاري بذكاء وسهولة.
          </p>
          <div className="flex justify-center gap-6 text-sm text-gray-400">
            <Link to="/privacy" className="hover:text-white transition-colors">سياسة الخصوصية</Link>
            <Link to="/terms" className="hover:text-white transition-colors">شروط الاستخدام</Link>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-gray-500 text-sm">
            © {new Date().getFullYear()} <span className="font-mostaqbali">بوصلة</span>. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}
