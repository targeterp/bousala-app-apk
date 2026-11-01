import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans" dir="rtl">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-brand-primary" />
            <h1 className="text-xl font-black text-gray-900">سياسة الخصوصية</h1>
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
          
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. مقدمة</h2>
          <p className="mb-6">
            نحن في منصة <strong className="text-gray-900">بوصلة</strong> نولي اهتماماً كبيراً بخصوصية بياناتك. 
            توضح هذه السياسة كيف نقوم بجمع واستخدام وحماية معلوماتك الشخصية ومعلومات متجرك وعملائك 
            عند استخدامك لتطبيقنا وخدماتنا.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. المعلومات التي نجمعها</h2>
          <ul className="list-disc list-inside space-y-3 mb-6 pr-4">
            <li><strong className="text-gray-900">معلومات الحساب:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، واسم المتجر.</li>
            <li><strong className="text-gray-900">بيانات المتجر:</strong> المنتجات، المبيعات، المصروفات، بيانات العملاء والموردين التي تقوم بإدخالها.</li>
            <li><strong className="text-gray-900">بيانات الاستخدام:</strong> معلومات حول كيفية استخدامك للتطبيق لتحسين تجربة المستخدم.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. كيف نستخدم معلوماتك</h2>
          <p className="mb-4">نستخدم المعلومات التي نجمعها للأغراض التالية:</p>
          <ul className="list-disc list-inside space-y-3 mb-6 pr-4">
            <li>تقديم خدمات التطبيق الأساسية (إدارة المخزون، المبيعات، التقارير).</li>
            <li>إنشاء وتشغيل متجرك الإلكتروني الخاص.</li>
            <li>تحسين وتطوير ميزات التطبيق.</li>
            <li>التواصل معك بخصوص التحديثات أو الدعم الفني.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. حماية البيانات</h2>
          <p className="mb-6">
            نحن نستخدم إجراءات أمنية متقدمة وتشفير سحابي لحماية بياناتك من الوصول غير المصرح به 
            أو التعديل أو الإفصاح أو الإتلاف. بيانات عملائك ومبيعاتك هي ملكك وحدك ولا نقوم بمشاركتها 
            مع أي أطراف ثالثة لأغراض تسويقية.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. مشاركة البيانات</h2>
          <p className="mb-4">
            لا نقوم ببيع أو تأجير معلوماتك الشخصية لأطراف ثالثة. قد نشارك المعلومات فقط في الحالات التالية:
          </p>
          <ul className="list-disc list-inside space-y-3 mb-6 pr-4">
            <li>بموافقتك الصريحة.</li>
            <li>للامتثال للمتطلبات القانونية أو أوامر المحكمة.</li>
            <li>مع مزودي الخدمات الموثوقين الذين يساعدوننا في تشغيل التطبيق (مثل خدمات الاستضافة السحابية)، والذين يلتزمون بشروط سرية صارمة.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. حقوقك</h2>
          <p className="mb-6">
            يحق لك الوصول إلى بياناتك الشخصية وتصحيحها أو حذفها في أي وقت من خلال إعدادات حسابك. 
            إذا كنت ترغب في حذف حسابك بالكامل، يمكنك التواصل مع فريق الدعم الفني.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. التغييرات على سياسة الخصوصية</h2>
          <p className="mb-6">
            قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر. سنقوم بإعلامك بأي تغييرات جوهرية 
            من خلال إشعار داخل التطبيق أو عبر البريد الإلكتروني.
          </p>

          <div className="mt-12 p-6 bg-gray-50 rounded-xl border border-gray-200 text-center">
            <p className="text-gray-600 font-medium">
              إذا كانت لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر الدعم الفني.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
