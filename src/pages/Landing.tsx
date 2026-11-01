import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Store, 
  TrendingUp, 
  Package, 
  Scissors, 
  Users, 
  ShieldCheck, 
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Star,
  Quote,
  Activity,
  Zap,
  BarChart3,
  Download,
  Smartphone
} from 'lucide-react';
import { Logo } from '../components/Logo';

export function Landing() {
  const stats = [
    { value: '+60', label: 'متجر مسجل' },
    { value: '+2,500', label: 'عملية مسجلة' },
    { value: '99.9%', label: 'استقرار النظام' },
    { value: '24/7', label: 'دعم فني' },
  ];

  const features = [
    {
      icon: <Package className="w-6 h-6 text-blue-500" />,
      title: 'إدارة مخزون ذكية ودقيقة',
      description: 'وداعاً للجرد اليدوي المتعب. تتبع منتجاتك، احصل على تنبيهات النواقص، وأدر مورديك بكل سهولة واحترافية.',
      color: 'bg-blue-50 text-blue-600'
    },
    {
      icon: <TrendingUp className="w-6 h-6 text-emerald-500" />,
      title: 'تقارير أرباح لحظية',
      description: 'اتخذ قراراتك بناءً على أرقام حقيقية. راقب مبيعاتك وأرباحك ومصروفاتك لحظة بلحظة مع رسوم بيانية تفصيلية.',
      color: 'bg-emerald-50 text-emerald-600'
    },
    {
      icon: <Users className="w-6 h-6 text-purple-500" />,
      title: 'إدارة العملاء والديون',
      description: 'سجل بيانات عملائك، تابع حساباتهم والديون المتأخرة، وأدر موظفيك ورواتبهم وسلفياتهم في مكان واحد.',
      color: 'bg-purple-50 text-purple-600'
    },
    {
      icon: <Scissors className="w-6 h-6 text-orange-500" />,
      title: 'نظام متكامل للتفصيل',
      description: 'الحل الأمثل لمشاغل الخياطة. أدر طلبات التفصيل، سجل المقاسات، واحسب تكلفة الأقمشة والعمالة بدقة متناهية.',
      color: 'bg-orange-50 text-orange-600'
    },
    {
      icon: <Activity className="w-6 h-6 text-rose-500" />,
      title: 'نقطة بيع سريعة (POS)',
      description: 'واجهة مبيعات سريعة تدعم الباركود والطباعة الفورية للفواتير لإدارة طوابير العملاء بكفاءة عالية.',
      color: 'bg-rose-50 text-rose-600'
    },
    {
      icon: <Sparkles className="w-6 h-6 text-amber-500" />,
      title: 'مساعد الذكاء الاصطناعي',
      description: 'مستشارك الخاص يعمل 24/7. احصل على نصائح لتحسين مبيعاتك، وتقليل هدر المخزون بناءً على بياناتك.',
      color: 'bg-amber-50 text-amber-600'
    }
  ];

  const testimonials = [
    {
      content: "منذ أن بدأنا استخدام بوصلة، تغيرت طريقة إدارتنا للمخزون والمبيعات بشكل جذري. النظام سلس وسهل، وتقارير الأرباح دقيقة جداً. ساعدني في اكتشاف أين تذهب أموالي وتوفير أكثر من 30% من الهدر.",
      author: "أحمد عبدالله",
      role: "مالك سلسلة سوبر ماركت",
      avatar: "https://ui-avatars.com/api/?name=أحمد+عبدالله&background=0D8BFF&color=fff&font-size=0.3"
    },
    {
      content: "برنامج متكامل، ساعدني كثير في ضبط حسابات العملاء والديون. ما عدت أحتاج للدفاتر ومشاكلها! ميزة نقطة البيع سريعة جداً حتى وقت الزحمة لا نتعطل أبداً. دعمهم الفني راقي وسريع التجاوب.",
      author: "محمد السالم",
      role: "مدير معرض عطور",
      avatar: "https://ui-avatars.com/api/?name=محمد+السالم&background=10B981&color=fff&font-size=0.3"
    },
    {
      content: "نظام الخياطة ريحني كثير من ضياع المقاسات وتأخير الطلبات. الآن يقدر كل خياط يدخل ويحدث حالة الطلب وأنا أتابع من الجوال في أي مكان. النظام هذا نقلة نوعية في عملنا.",
      author: "شيخن عبدالرحمن",
      role: "مالك مشغل خياطة",
      avatar: "https://ui-avatars.com/api/?name=شيخن+عبدالرحمن&background=8B5CF6&color=fff&font-size=0.3"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-brand-primary/20" dir="rtl">
      {/* Navbar - Glassmorphism */}
      <nav className="fixed top-0 left-0 right-0 bg-white/70 backdrop-blur-xl z-50 border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand-primary to-emerald-400 rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/20">
                <Logo className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-gray-900 tracking-tight font-mostaqbali">بوصلة</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-bold text-gray-600">
              <a href="#features" className="hover:text-brand-primary transition-colors">المميزات</a>
              <a href="#testimonials" className="hover:text-brand-primary transition-colors">تجارب العملاء</a>
              <Link to="/pricing" className="hover:text-brand-primary transition-colors">الأسعار</Link>
              <Link to="/download" className="text-brand-primary hover:text-brand-dark transition-colors flex items-center gap-1 font-extrabold">
                <Smartphone className="w-4 h-4" />
                تحميل التطبيق (APK)
              </Link>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
              <Link to="/login" className="text-sm font-bold text-gray-700 hover:text-brand-primary transition-colors">
                دخول
              </Link>
              <Link to="/login?mode=signup" className="flex bg-gray-900 text-white px-3.5 py-2 md:px-5 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-bold hover:bg-gray-800 transition-all shadow-md items-center gap-1.5 md:gap-2">
                ابدأ مجاناً 
                <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Persuasive & Bold */}
      <section className="pt-32 md:pt-40 pb-16 md:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center relative overflow-hidden">
        {/* Decorative blurring circles */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[300px] md:h-[400px] bg-brand-primary/10 rounded-full blur-3xl -z-10 mix-blend-multiply opacity-70"></div>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs md:text-sm mb-6 md:mb-8 ring-1 ring-emerald-200 shadow-sm">
            <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            المنظومة الأقوى لإدارة المتاجر والأعمال
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-gray-900 tracking-tight mb-4 md:mb-6 leading-[1.2] md:leading-tight max-w-4xl mx-auto">
            توقف عن الخسارة.. وابدأ في <br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-brand-primary to-emerald-500">
              التحكم الكامل بتجارتك
            </span>
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-gray-500 mb-8 md:mb-10 max-w-3xl mx-auto leading-relaxed font-medium px-2">
            تخلص من قيود الدفاتر الورقية وجداول الإكسل المعقدة. (بوصلة) هو نظامك السحابي المتكامل لإدارة المبيعات، المخزون، والديون بدقة 100٪ وبدون أي أخطاء بشرية.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 w-full px-4 sm:px-0 max-w-md mx-auto sm:max-w-none">
            <Link 
              to="/login?mode=signup" 
              className="w-full sm:w-auto px-6 py-4 md:px-10 bg-brand-primary text-white rounded-2xl font-bold text-base md:text-lg hover:scale-105 transition-all shadow-xl shadow-brand-primary/30 flex items-center justify-center gap-2 group"
            >
              افتح حسابك مجاناً الآن
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </Link>
            <Link 
              to="/download" 
              className="w-full sm:w-auto px-6 py-4 md:px-8 bg-emerald-50 text-emerald-800 rounded-2xl font-bold text-base md:text-lg hover:bg-emerald-100 transition-all border border-emerald-200 shadow-sm flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5 text-emerald-600" />
              تحميل تطبيق الهاتف (APK)
            </Link>
          </div>
          
          <div className="mt-8 md:mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:gap-x-8 md:gap-y-4 text-xs md:text-sm text-gray-600 font-bold px-2">
            <div className="flex items-center gap-1.5 md:gap-2">
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
              لا يتطلب بطاقة ائتمان
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
              نسخ احتياطي يومي
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
              يعمل على أي جهاز
            </div>
          </div>
        </motion.div>

        {/* Dashboard Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 md:mt-24 max-w-5xl mx-auto relative z-20 group px-2 sm:px-4"
          style={{ perspective: '1200px' }}
        >
          <motion.div 
             initial={{ rotateX: 10 }}
             animate={{ rotateX: 0 }}
             transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
             className="relative transform-gpu transition-all duration-500"
          >
            
            <div className="w-full flex justify-center">
              <img 
                src="/Bousala-raprts.png" 
                alt="واجهة تقارير النظام" 
                className="w-full h-auto object-contain drop-shadow-2xl"
              />
            </div>
            
            {/* Interactive floating elements */}
            <motion.div 
               animate={{ y: [0, -15, 0] }}
               transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
               className="absolute top-[30%] -left-2 md:-left-8 lg:-left-12 bg-white/90 backdrop-blur-md px-4 py-3 md:px-5 md:py-4 rounded-xl md:rounded-2xl shadow-xl border border-white/50 flex items-center gap-3 md:gap-4 hidden sm:flex"
            >
              <div className="text-right">
                <p className="text-[10px] md:text-xs text-gray-500 font-bold mb-0.5 md:mb-1">المبيعات الإجمالية</p>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="text-emerald-500 text-[10px] md:text-xs font-bold bg-emerald-50 px-1.5 py-0.5 rounded">+46.2%</span>
                  <p className="text-base md:text-xl font-black text-gray-900">MRU 133,270</p>
                </div>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg md:rounded-xl flex items-center justify-center border border-emerald-200 text-emerald-600">
                 <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </motion.div>

            <motion.div 
               animate={{ y: [0, 10, 0] }}
               transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
               className="absolute bottom-[20%] -right-2 md:-right-8 lg:-right-10 bg-white/90 backdrop-blur-md p-3 md:p-4 rounded-xl md:rounded-2xl shadow-xl border border-white/50 flex items-center gap-3 md:gap-4 hidden sm:flex"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-primary/10 rounded-lg md:rounded-xl flex items-center justify-center text-brand-primary">
                 <BarChart3 className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="text-right">
                <p className="text-[10px] md:text-xs text-gray-500 font-bold mb-0.5 md:mb-1">الأرباح الشهرية</p>
                <div className="flex items-center gap-1.5 md:gap-2">
                   <p className="text-xs md:text-sm font-black text-brand-primary">عرض التفاصيل</p>
                   <span className="flex h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-brand-primary animate-pulse"></span>
                </div>
              </div>
            </motion.div>
          </motion.div>
          
          {/* Glowing shadow effect behind the image */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[60%] bg-emerald-400/20 blur-[80px] md:blur-[120px] -z-10 rounded-full opacity-60"></div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white border-y border-gray-100 relative z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold border border-emerald-100">أول شهر - أفضل بداية 🚀</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-5xl font-black text-gray-900 mb-2 font-mono tracking-tight">{stat.value}</div>
                <div className="text-sm md:text-base font-bold text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-6 tracking-tight">نظام واحد، يحل كل مشاكلك</h2>
            <p className="text-xl text-gray-500 leading-relaxed">
              لقد درسنا معاناة أصحاب الأعمال التجارية، وصممنا بوصلة ليكون العصا السحرية التي تحل معضلة الإدارة بشكل جذري.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-50 p-8 rounded-3xl border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all group hover:bg-white"
              >
                <div className={`w-14 h-14 rounded-2xl ${feature.color.split(' ')[0]} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed font-medium">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Reliability */}
      <section className="py-24 bg-gray-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-brand-primary opacity-5 mix-blend-screen"></div>
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <ShieldCheck className="w-20 h-20 text-brand-primary mx-auto mb-8" />
          <h2 className="text-3xl md:text-5xl font-black mb-6">سرية تامة وبيانات محفوظة بأمان</h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            بيانات تجارتك وحسابات عملائك تعامل بأعلى معايير التشفير البنكي المتقدمة. نقوم بعمل نسخ احتياطية تلقائية لنضمن لك عدم ضياع أي معلومة حتى لو فقدت جهازك.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto text-right">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <Zap className="w-8 h-8 text-amber-400 mb-4" />
              <h4 className="font-bold text-lg mb-2">سرعة فائقة بالاستجابة</h4>
              <p className="text-sm text-gray-400">سيرفرات سحابية توفر أداء جبار حتى في أوقات الذروة.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mb-4" />
              <h4 className="font-bold text-lg mb-2">تشفير كامل</h4>
              <p className="text-sm text-gray-400">لا يمكن لأحد الاطلاع على بيانات أرباحك وعملائك غيرك.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <BarChart3 className="w-8 h-8 text-blue-400 mb-4" />
              <h4 className="font-bold text-lg mb-2">نسخ احتياطي لحظي</h4>
              <p className="text-sm text-gray-400">كل عملية بيع يتم حفظ نسختها مباشرة في السحابة.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Testimonials */}
      <section id="testimonials" className="py-24 bg-gray-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
             <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 text-orange-800 font-bold text-sm mb-4">
              <Star className="w-4 h-4 fill-orange-500 text-orange-500" />
              تقييم 4.9/5 من المستخدمين
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-4">ماذا يقول التجار عن بوصلة؟</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              قصص نجاح حقيقية من تجار استطاعوا تحويل الفوضى إلى نظام متكامل زاد من أرباحهم ووفر وقتهم.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 relative group hover:shadow-xl transition-all hover:border-brand-primary/30"
              >
                <div className="absolute -top-5 right-8 w-10 h-10 bg-brand-primary text-white rounded-xl flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-6 transition-transform shadow-lg shadow-brand-primary/30">
                  <Quote className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1 mb-6 mt-2">
                  {[...Array(5)].map((_, idx) => (
                    <Star key={idx} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-700 leading-loose mb-8 text-lg font-medium relative z-10">"{testimonial.content}"</p>
                <div className="flex items-center gap-4 mt-auto pt-6 border-t border-gray-50">
                  <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100" />
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">{testimonial.author}</h4>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-gradient-to-br from-brand-primary to-emerald-600 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pattern-grid-lg text-white/5"></div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight">لا تؤجل نجاح إدارتك للغد</h2>
          <p className="text-emerald-100 text-xl mb-12 max-w-2xl mx-auto font-medium">
            انضم للآلاف من أصحاب الأعمال الذين سبقوك خطوة في إدارة تجارتهم باحترافية، وتمتع بالتحكم الكامل.
          </p>
          <Link 
            to="/login?mode=signup" 
            className="inline-flex items-center justify-center px-10 py-5 bg-white text-gray-900 rounded-2xl font-black text-xl hover:scale-105 transition-all shadow-2xl shadow-black/20 gap-3"
          >
            جرب النظام الآن مجاناً
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <p className="mt-6 text-sm text-emerald-200/80 font-medium">التسجيل لا يأخذ سوى 30 ثانية - يمكنك الإلغاء في أي وقت</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-gray-100 text-gray-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Logo className="w-6 h-6 text-brand-primary" />
                <span className="text-2xl text-gray-900 tracking-wider font-black font-mostaqbali">بوصلة</span>
              </div>
              <p className="text-sm max-w-sm leading-relaxed font-medium">
                المنصة العربية الأسهل والأشمل لإدارة المتاجر والمخزون وطلبات التفصيل بدقة واحترافية.
              </p>
            </div>
            <div>
              <h4 className="text-gray-900 font-bold mb-4">روابط سريعة</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li><a href="#features" className="hover:text-brand-primary transition-colors">المميزات الأساسية</a></li>
                <li><a href="#testimonials" className="hover:text-brand-primary transition-colors">آراء العملاء</a></li>
                <li><Link to="/pricing" className="hover:text-brand-primary transition-colors">الأسعار والباقات</Link></li>
                <li><Link to="/tutorial" className="hover:text-brand-primary transition-colors">كيف يعمل التطبيق؟</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-gray-900 font-bold mb-4">قانوني والدعم</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li><Link to="/login" className="hover:text-brand-primary transition-colors">تسجيل الدخول</Link></li>
                <li><Link to="/privacy" className="hover:text-brand-primary transition-colors">سياسة الخصوصية</Link></li>
                <li><Link to="/terms" className="hover:text-brand-primary transition-colors">شروط الاستخدام</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 text-sm text-center flex flex-col md:flex-row justify-between items-center gap-4 font-bold">
            <p>© {new Date().getFullYear()} بوصلة. جميع الحقوق محفوظة.</p>
            <div className="flex gap-4">
               <span>دعم فني جاهز لخدمتك 24/7</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

