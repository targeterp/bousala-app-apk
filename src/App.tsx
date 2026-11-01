/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { TenantProvider } from './contexts/TenantContext';

import { Layout } from './components/Layout';
import { supabase } from './lib/supabase';
import { SubscriptionGuard } from './components/SubscriptionGuard';
import { Loader2 } from 'lucide-react';
import { InstallProvider } from './contexts/InstallContext';
import { Toaster } from 'react-hot-toast';

// Lazy loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Marketing = lazy(() => import('./pages/Marketing').then(m => ({ default: m.Marketing })));
const Customers = lazy(() => import('./pages/Customers').then(m => ({ default: m.Customers })));
const Products = lazy(() => import('./pages/Products').then(m => ({ default: m.Products })));
const Sales = lazy(() => import('./pages/Sales').then(m => ({ default: m.Sales })));
const Expenses = lazy(() => import('./pages/Expenses').then(m => ({ default: m.Expenses })));
const Suppliers = lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const Employees = lazy(() => import('./pages/Employees').then(m => ({ default: m.Employees })));
const Finance = lazy(() => import('./pages/Finance').then(m => ({ default: m.Finance })));
const Inventory = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Reports = lazy(() => import('./pages/Reports'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then(m => ({ default: m.PlaceholderPage })));
const Production = lazy(() => import('./pages/CustomOrders').then(m => ({ default: m.Production })));
const Auth = lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Storefront = lazy(() => import('./pages/Storefront').then(m => ({ default: m.Storefront })));
const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse').then(m => ({ default: m.TermsOfUse })));
const Tutorial = lazy(() => import('./pages/Tutorial').then(m => ({ default: m.Tutorial })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const DownloadPage = lazy(() => import('./pages/Download').then(m => ({ default: m.DownloadPage })));

export default function App() {
  const [session, setSession] = useState<any>(
    localStorage.getItem('target_is_logged_in') === 'true' ? { id: 'optimistic' } : null
  );
  const [isLoading, setIsLoading] = useState(false); // Remove blocking loader
  const [clockSkewError, setClockSkewError] = useState(false);

  useEffect(() => {
    const ensureProfile = async (session: any) => {
      if (!session?.user) return;

      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .single();
          
        if (error) {
          // Profile doesn't exist, create it
          const trialEndDate = new Date();
          trialEndDate.setDate(trialEndDate.getDate() + 7);
          
          await supabase.from('profiles').insert([{
            id: session.user.id,
            full_name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'مستخدم',
            role: 'admin', // Default first user to admin, or just employee
            subscription_plan: 'trial',
            subscription_end_date: trialEndDate.toISOString()
          }]);
        }
      } catch (err) {
        console.error('Error ensuring profile:', err);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        localStorage.setItem('target_is_logged_in', 'true');
        console.log("JWT Token Length is:", session.access_token.length);
        if (session.access_token.length > 6000) {
           console.error("JWT TOKEN IS DANGEROUSLY LARGE! THIS WILL CAUSE FAILED TO FETCH ERRORS.");
        }
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt < now) {
          setClockSkewError(true);
          supabase.auth.signOut();
          setSession(null);
          localStorage.removeItem('target_is_logged_in');
          setIsLoading(false);
          return;
        }
      } else {
        localStorage.removeItem('target_is_logged_in');
      }
      setSession(session);
      ensureProfile(session);
      setIsLoading(false);
    }).catch(err => {
      console.error('Failed to get session:', err);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        localStorage.setItem('target_is_logged_in', 'true');
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt < now) {
          setClockSkewError(true);
          supabase.auth.signOut();
          setSession(null);
          localStorage.removeItem('target_is_logged_in');
          return;
        }
      } else {
        localStorage.removeItem('target_is_logged_in');
      }
      setSession(session);
      ensureProfile(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (clockSkewError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 text-center" dir="rtl">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">توقيت جهازك غير صحيح</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          يرجى ضبط الوقت والتاريخ في جهازك (الكمبيوتر أو الهاتف) لتتمكن من استخدام التطبيق. التوقيت غير الصحيح يمنع تسجيل الدخول بأمان.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-dark transition-colors"
        >
          تحديث الصفحة بعد ضبط الوقت
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="target-theme">
      <Toaster 
        position="top-center" 
        reverseOrder={false} 
        toastOptions={{
          style: {
            fontFamily: 'inherit',
            direction: 'rtl'
          }
        }} 
      />
      <SettingsProvider>
        <TenantProvider>
          <InstallProvider>
            <BrowserRouter>
              <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
              </div>
            }>
              <Routes>
                {/* Public Storefront Route */}
                <Route path="/store/:storeSlug" element={<Storefront />} />
                
                {/* Public Static Pages */}
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfUse />} />
                <Route path="/tutorial" element={<Tutorial />} />
                <Route path="/download" element={<DownloadPage />} />
                
                {/* Auth Route */}
              {!session ? (
                <>
                  <Route path="/" element={<Landing />} />
                  <Route path="/login" element={<Auth />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </>
              ) : (
                /* Protected Routes */
                <Route path="/" element={<SubscriptionGuard><Layout /></SubscriptionGuard>}>
                  <Route index element={<Dashboard />} />
                  <Route path="products" element={<Products />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="sales" element={<Sales />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="employees" element={<Employees />} />
                  <Route path="finance" element={<Finance />} />
                  <Route path="marketing" element={<Marketing />} />
                  <Route path="admin" element={<Admin />} />
                  <Route path="custom-orders" element={<Production />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="more" element={<PlaceholderPage title="المزيد" />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              )}
            </Routes>
            </Suspense>
            </BrowserRouter>
          </InstallProvider>
        </TenantProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
