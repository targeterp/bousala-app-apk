import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText } from 'lucide-react';

export function TermsOfUse() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans" dir="rtl">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-brand-primary" />
            <h1 className="text-xl font-black text-gray-900">شروط الاستخدام</h1>
          </div>
          <Link to="/" className="text-gray-500 hover:text-gray-900 flex items-center gap-2 text-sm font-medium transition-colors">
            العودة للرئيسية
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12 text-gray-700 leading-loose text-lg">
          <p className="text-sm text-gray-500 mb-8">آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</p>
          
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. الموافقة على الشروط</h2>
          <p className="mb-6">
            مرحباً بك في <strong className="text-gray-900">بوصلة</strong>. باستخدامك لتطبيقنا وخدماتنا، فإنك توافق على الالتزام 
            بهذه الشروط والأحكام. إذا كنت لا توافق على أي جزء من هذه الشروط، يرجى عدم استخدام التطبيق.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. وصف الخدمة</h2>
          <p className="mb-6">
            بوصلة هي منصة سحابية توفر أدوات لإدارة المتاجر، المخزون، المبيعات، العملاء، 
            وطلبات التفصيل. كما تتيح للمستخدمين إنشاء واجهة متجر إلكتروني لعرض منتجاتهم.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. حساب المستخدم</h2>
          <ul className="list-disc list-inside space-y-3 mb-6 pr-4">
            <li>أنت مسؤول عن الحفاظ على سرية بيانات حسابك وكلمة المرور.</li>
            <li>يجب تقديم معلومات دقيقة وكاملة عند التسجيل.</li>
            <li>أنت توافق على إبلاغنا فوراً بأي استخدام غير مصرح به لحسابك.</li>
            <li>لا نتحمل أي مسؤولية عن أي خسارة أو ضرر ناتج عن فشلك في حماية حسابك.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. الاستخدام المقبول</h2>
          <p className="mb-4">أنت توافق على عدم استخدام التطبيق في:</p>
          <ul className="list-disc list-inside space-y-3 mb-6 pr-4">
            <li>أي نشاط غير قانوني أو احتيالي.</li>
            <li>بيع منتجات ممنوعة قانوناً أو تنتهك حقوق الملكية الفكرية للآخرين.</li>
            <li>إرسال رسائل مزعجة (Spam) أو فيروسات أو أي برمجيات خبيثة.</li>
            <li>محاولة اختراق النظام أو الوصول غير المصرح به لبيانات مستخدمين آخرين.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. المحتوى الخاص بك</h2>
          <p className="mb-6">
            أنت تحتفظ بجميع حقوق الملكية للمحتوى الذي تقوم بإدخاله في التطبيق (المنتجات، الصور، بيانات العملاء). 
            بإدخالك لهذا المحتوى، فإنك تمنحنا ترخيصاً لاستخدامه فقط لغرض تقديم الخدمة لك (مثل عرض منتجاتك في متجرك الإلكتروني).
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. الاشتراكات والمدفوعات</h2>
          <p className="mb-6">
            قد تتطلب بعض الميزات المتقدمة اشتراكاً مدفوعاً. سيتم توضيح رسوم الاشتراك وشروط الدفع 
            بشكل واضح قبل إتمام عملية الشراء. نحتفظ بالحق في تغيير الأسعار مع إشعار مسبق.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. إخلاء المسؤولية</h2>
          <p className="mb-6">
            يتم تقديم التطبيق "كما هو" دون أي ضمانات صريحة أو ضمنية. لا نضمن أن الخدمة ستكون 
            خالية من الأخطاء أو الانقطاعات. نحن غير مسؤولين عن أي خسائر مالية أو أضرار غير مباشرة 
            تنتج عن استخدامك للتطبيق.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. التعديلات على الشروط</h2>
          <p className="mb-6">
            نحتفظ بالحق في تعديل هذه الشروط في أي وقت. استمرارك في استخدام التطبيق بعد 
            نشر التعديلات يعتبر موافقة منك على الشروط الجديدة.
          </p>

          <div className="mt-12 p-6 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <p className="text-gray-600 font-medium">
              إذا كانت لديك أي أسئلة حول شروط الاستخدام، يرجى التواصل معنا عبر الدعم الفني.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
