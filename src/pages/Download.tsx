import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Share, 
  PlusSquare, 
  Smartphone, 
  Zap, 
  Bell, 
  WifiOff, 
  ArrowRight, 
  ExternalLink, 
  Loader2, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  FileDown,
  Info
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInstall } from '../contexts/InstallContext';

export function DownloadPage() {
  const { isInstallable, isInstalled, isIOS, isAndroid, isChecking, promptInstall } = useInstall();
  const [isInIframe, setIsInIframe] = useState(false);
  const [showPwaOptions, setShowPwaOptions] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  const openInNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-brand-primary hover:text-brand-dark transition-colors font-bold">
            <ArrowRight className="w-5 h-5" />
            العودة للرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center text-white font-bold">
              ب
            </div>
            <span className="font-bold text-xl tracking-tight">بوصلة</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        {/* Title Section */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-brand-primary/10 text-brand-primary rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm ring-8 ring-brand-primary/5">
            <Smartphone className="w-10 h-10" />
          </div>
          <h1 className="text-3xl sm:text-5xl font-black mb-3 tracking-tight">حمّل تطبيق بوصلة للهاتف</h1>
          <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            احصل على التطبيق مباشرة على هاتفك لتجربة أسرع وإدارة كاملة لمبيعاتك ومخزونك في أي وقت.
          </p>
        </div>

        {/* PRIMARY CARD: APK Direct Download */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 dark:border-gray-800 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-brand-primary via-emerald-400 to-teal-500"></div>

          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ملف APK متاح الآن للأندرويد
            </div>

            <h2 className="text-2xl sm:text-3xl font-black mb-3">تحميل ملف الـ APK المباشر</h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6">
              اضغط على الزر أدناه لتنزيل ملف التثبيت المباشر بصيغة <span className="font-bold text-brand-primary">.apk</span> على هاتفك الأندرويد.
            </p>

            {/* Download CTA Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <a 
                href="https://github.com/targeterp/bousala-app-apk/releases/latest/download/bousala.apk" 
                download="bousala.apk"
                className="w-full sm:w-auto px-10 py-4 bg-brand-primary hover:bg-brand-dark text-white rounded-2xl font-black text-lg shadow-xl shadow-brand-primary/25 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <FileDown className="w-6 h-6 animate-bounce" />
                تحميل التطبيق (APK)
              </a>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500 dark:text-gray-400 font-medium pb-8 border-b border-gray-100 dark:border-gray-800">
              <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                آمن وخالٍ من الإعلانات
              </span>
              <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                نظام Android 7.0 فأحدث
              </span>
              <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg">
                <Zap className="w-4 h-4 text-yellow-500" />
                الإصدار 1.0.0
              </span>
            </div>

            {/* 3 Step Installation Instructions */}
            <div className="mt-8 text-right">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-brand-primary" />
                طريقة التثبيت بعد التحميل (3 خطوات بسيطة):
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                  <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold text-sm mb-2">
                    1
                  </div>
                  <h4 className="font-bold text-sm mb-1">اضغط تحميل</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    اضغط على زر التحميل وانتظر اكتمال تنزيل ملف <b>bousala.apk</b> على هاتفك.
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                  <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold text-sm mb-2">
                    2
                  </div>
                  <h4 className="font-bold text-sm mb-1">افتح الملف</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    اضغط على إشعار اكتمال التحميل أو افتح مجلد "التنزيلات" (Downloads) في جهازك.
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                  <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold text-sm mb-2">
                    3
                  </div>
                  <h4 className="font-bold text-sm mb-1">تثبيت التطبيق</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    اختر "تثبيت". إذا ظهر لك تنبيه أمان، اضغط على <b>"التثبيت على أي حال"</b>.
                  </p>
                </div>
              </div>

              {/* Security Hint Alert */}
              <div className="mt-4 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">ملاحظة أمان:</span> نظراً لأن التطبيق يتم تحميله مباشرة كملف APK (خارج متجر جوجل بلاي)، قد يُظهر لك هاتفك رسالة تنبيه اعتيادية تفيد بأن الملف قد يكون غير معروف. التطبيق آمن 100%، ويمكنك متابعة التثبيت بالضغط على "تثبيت على أي حال" أو تفعيل "السماح بالتثبيت من هذا المصدر".
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECONDARY SECTION: iOS / Web App Installation */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-gray-800 mb-12">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPwaOptions(!showPwaOptions)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold">
                🍎
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg">تستخدم هاتف آيفون (iOS) أو ترغب بالتثبيت السريع دون تحميل ملفات؟</h3>
                <p className="text-xs sm:text-sm text-gray-500">يمكنك تثبيت تطبيق الويب (PWA) مباشرة على شاشتك الرئيسية</p>
              </div>
            </div>
            <button className="text-sm font-bold text-brand-primary hover:underline px-2 py-1">
              {showPwaOptions ? "إخفاء" : "عرض الطريقة"}
            </button>
          </div>

          {showPwaOptions && (
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              {isChecking ? (
                <div className="py-6 flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                  <p className="text-gray-500 font-bold text-sm">جاري التحقق من إمكانية التثبيت...</p>
                </div>
              ) : isInstalled ? (
                <div className="text-center py-4">
                  <p className="text-green-600 font-bold text-base">التطبيق مثبت بالفعل على متصفحك!</p>
                  <Link to="/login" className="inline-block mt-3 bg-brand-primary text-white px-6 py-2 rounded-xl text-sm font-bold">
                    فتح التطبيق
                  </Link>
                </div>
              ) : isIOS ? (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    على متصفح Safari في الآيفون: اضغط على زر <b>المشاركة (Share)</b> في الأسفل ثم اختر <b>"إضافة للشاشة الرئيسية" (Add to Home Screen)</b>.
                  </p>
                </div>
              ) : isInstallable ? (
                <div className="text-center py-4">
                  <button 
                    onClick={promptInstall}
                    className="bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-8 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    تثبيت كتطبيق ويب (PWA)
                  </button>
                </div>
              ) : (
                <div className="text-center py-2 text-sm text-gray-500">
                  {isInIframe ? (
                    <button onClick={openInNewTab} className="text-brand-primary font-bold hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="w-4 h-4" />
                      فتح في نافذة مستقلة لتفعيل التثبيت
                    </button>
                  ) : (
                    <span>يمكنك إضافة الموقع للشاشة الرئيسية من قائمة متصفحك (⋮).</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
            <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-2">سرعة فائقة</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تجربة استخدام أسرع بكثير من المتصفح العادي مع استجابة فورية.
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-2">يعمل بدون إنترنت</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              إمكانية الوصول لبياناتك الأساسية حتى عند انقطاع الاتصال.
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-2">إشعارات فورية</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ابق على اطلاع دائم بآخر التحديثات والمبيعات عبر الإشعارات.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
