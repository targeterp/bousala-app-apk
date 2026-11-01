import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  ArrowRight, 
  BookOpen, 
  Store, 
  PackagePlus, 
  ShoppingCart, 
  Scissors, 
  BarChart3,
  Settings
} from 'lucide-react';

export function Tutorial() {
  const steps = [
    {
      icon: <Settings className="w-8 h-8 text-blue-500" />,
      title: '1. إعداد المتجر',
      description: 'ابدأ بضبط إعدادات متجرك من صفحة "الإعدادات". أدخل اسم نشاطك التجاري، رقم التواصل (واتساب)، واختر رابطاً مخصصاً لمتجرك الإلكتروني ليتمكن عملاؤك من زيارته.',
      color: 'bg-blue-50 border-blue-100'
    },
    {
      icon: <PackagePlus className="w-8 h-8 text-purple-500" />,
      title: '2. إضافة المنتجات',
      description: 'انتقل إلى قسم "المنتجات" وأضف بضاعتك. حدد اسم المنتج، السعر، التكلفة، والكمية المتوفرة. لا تنسَ تفعيل خيار "نشر في المتجر" إذا كنت ترغب بعرضه للعملاء.',
      color: 'bg-purple-50 border-purple-100'
    },
    {
      icon: <ShoppingCart className="w-8 h-8 text-green-500" />,
      title: '3. تسجيل المبيعات',
      description: 'عند إتمام عملية بيع، اذهب إلى "المبيعات" وسجل الفاتورة. سيقوم النظام تلقائياً بخصم الكمية المباعة من المخزون وحساب الأرباح بناءً على التكلفة وسعر البيع.',
      color: 'bg-green-50 border-green-100'
    },
    {
      icon: <Scissors className="w-8 h-8 text-orange-500" />,
      title: '4. إدارة التفصيل (للخياطين)',
      description: 'إذا كان نشاطك يتضمن تفصيل الملابس، استخدم قسم "الطلبات الخاصة". يمكنك تسجيل مقاسات العميل، حساب أمتار القماش المطلوبة، وتتبع حالة الطلب (قيد التنفيذ، جاهز، مسلم).',
      color: 'bg-orange-50 border-orange-100'
    },
    {
      icon: <Store className="w-8 h-8 text-indigo-500" />,
      title: '5. واجهة المتجر للعملاء',
      description: 'شارك الرابط الخاص بك مع عملائك. سيتمكنون من تصفح منتجاتك المنشورة والطلب مباشرة عبر التواصل معك على الواتساب بضغطة زر.',
      color: 'bg-indigo-50 border-indigo-100'
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-rose-500" />,
      title: '6. متابعة التقارير',
      description: 'راقب أداء عملك من خلال صفحة "التقارير". ستجد تحليلات مفصلة للمبيعات، الأرباح، المصروفات، وحالة المخزون لاتخاذ قرارات أفضل.',
      color: 'bg-rose-50 border-rose-100'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-brand-primary" />
            <h1 className="text-xl font-black text-gray-900">دليل الاستخدام</h1>
          </div>
          <Link to="/" className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-medium transition-colors">
            العودة للرئيسية
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-brand-primary py-16 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">كيف تستخدم بوصلة؟</h2>
          <p className="text-xl text-brand-primary-50 leading-relaxed">
            خطوات بسيطة وسريعة للبدء في إدارة متجرك باحترافية. 
            تعرف على الميزات الأساسية وكيفية الاستفادة منها بأفضل شكل.
          </p>
        </div>
      </section>

      {/* Steps Grid */}
      <main className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`p-8 rounded-3xl border ${step.color} bg-white shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className={`w-16 h-16 rounded-2xl ${step.color.split(' ')[0]} flex items-center justify-center mb-6`}>
                {step.icon}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed text-lg">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mt-16 bg-gray-900 rounded-3xl p-10 text-center text-white"
        >
          <h3 className="text-2xl md:text-3xl font-bold mb-4">جاهز للبدء؟</h3>
          <p className="text-gray-400 mb-8 max-w-2xl mx-auto text-lg">
            قم بتسجيل الدخول الآن وابدأ بتطبيق هذه الخطوات لتنظيم أعمالك وزيادة مبيعاتك.
          </p>
          <Link 
            to="/login" 
            className="inline-flex items-center justify-center px-8 py-4 bg-brand-primary text-white rounded-xl font-bold text-lg hover:bg-brand-secondary transition-all shadow-lg shadow-brand-primary/20"
          >
            الذهاب إلى لوحة التحكم
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
