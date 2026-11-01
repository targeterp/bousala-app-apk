import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Package, 
  Users, 
  ShoppingCart, 
  Megaphone, 
  BarChart3, 
  Bot, 
  Settings, 
  Menu,
  Moon,
  Sun,
  MoreHorizontal,
  LogOut,
  Store,
  DollarSign,
  Truck,
  UserCircle,
  Receipt,
  Scissors,
  X,
  AlertCircle,
  Lock,
  Download,
  Boxes
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../utils';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { ErrorBoundary } from './ErrorBoundary';
import { Logo } from './Logo';
import { useSubscription } from './SubscriptionGuard';
import { useInstall } from '../contexts/InstallContext';
import { SyncManager } from './SyncManager';

// Add RBAC roles to navigation items definition
const desktopNavItems = [
  { name: 'الرئيسية', path: '/', icon: Home, roles: ['admin', 'seller', 'accountant'] },
  { name: 'المبيعات', path: '/sales', icon: ShoppingCart, roles: ['admin', 'seller'] },
  { name: 'المنتجات', path: '/products', icon: Package, roles: ['admin', 'seller', 'accountant'] },
  { name: 'المخزون', path: '/inventory', icon: Boxes, roles: ['admin', 'accountant'] },
  { name: 'العملاء', path: '/customers', icon: Users, roles: ['admin', 'seller', 'accountant'] },
  { name: 'الموردين', path: '/suppliers', icon: Truck, roles: ['admin', 'accountant'] },
  { name: 'المصروفات', path: '/expenses', icon: Receipt, roles: ['admin', 'accountant'] },
  { name: 'الموظفين', path: '/employees', icon: UserCircle, locked: true, roles: ['admin'] },
  { name: 'الإنتاج والطلبات', path: '/custom-orders', icon: Scissors, roles: ['admin'] },
  { name: 'المالية', path: '/finance', icon: DollarSign, locked: true, roles: ['admin', 'accountant'] },
  { name: 'التسويق', path: '/marketing', icon: Megaphone, roles: ['admin'] },
  { name: 'التقارير', path: '/reports', icon: BarChart3, locked: true, roles: ['admin', 'accountant'] },
  { name: 'الإعدادات', path: '/settings', icon: Settings, locked: true, roles: ['admin'] },
];

const mobileNavItems = [
  { name: 'الرئيسية', path: '/', icon: Home, roles: ['admin', 'seller', 'accountant'] },
  { name: 'المبيعات', path: '/sales', icon: ShoppingCart, roles: ['admin', 'seller'] },
  { name: 'العملاء', path: '/customers', icon: Users, roles: ['admin', 'seller', 'accountant'] },
  { name: 'المنتجات', path: '/products', icon: Package, roles: ['admin', 'seller', 'accountant'] },
  { name: 'المزيد', path: '/more', icon: MoreHorizontal, roles: ['admin', 'accountant'] }, // Using more for admin
];

export function Layout() {
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isExpired, setShowRenewModal } = useSubscription();
  const { isInstallable, isInstalled, isIOS, promptInstall } = useInstall();

  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<'admin'|'seller'|'accountant'|'custom'>('admin');
  const [userPermissions, setUserPermissions] = useState<string[]>(['*']);
  const [profile, setProfile] = useState<{ id: string, fullName: string, businessName: string, storeSlug?: string, subscriptionEndDate?: string } | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [showTrialModal, setShowTrialModal] = useState(false);

  useEffect(() => {
    const fetchUserAndRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Step 1: Fetch actual user role via RPC
      let activeRole: 'admin'|'seller'|'accountant'|'custom' = 'admin';
      let activePermissions: string[] = ['*'];
      try {
        const { data: roleData, error: roleError } = await supabase.rpc('get_current_user_role');
        if (!roleError && roleData) {
          activeRole = roleData;
        }

        const { data: permsData, error: permsError } = await supabase.rpc('get_current_user_permissions');
        if (!permsError && permsData) {
          activePermissions = permsData;
        }
      } catch (e) {
        console.error('Failed to fetch role', e);
      }
      setUserRole(activeRole);
      setUserPermissions(activePermissions);

      // Step 2: Extract profile info and resolve tenant/store information
      let targetTenantId = localStorage.getItem('target_tenant_id');
      try {
        const { data: tenantRpcId } = await supabase.rpc('get_current_tenant_id');
        if (tenantRpcId) {
          targetTenantId = tenantRpcId;
          localStorage.setItem('target_tenant_id', tenantRpcId);
        }
      } catch (e) {
        console.warn('Could not resolve get_current_tenant_id RPC in Layout:', e);
      }
      
      const finalTenantId = targetTenantId || user.id;

      // Fetch store tenant profile
      let storeBusinessName = user.user_metadata?.business_name;
      let subscriptionEndDate: string | undefined;

      try {
        const { data: tenantProfile } = await supabase
          .from('profiles')
          .select('full_name, business_name, subscription_end_date')
          .eq('id', finalTenantId)
          .maybeSingle();

        if (tenantProfile) {
          if (tenantProfile.business_name) {
            storeBusinessName = tenantProfile.business_name;
          }
          subscriptionEndDate = tenantProfile.subscription_end_date;
        }
      } catch (err) {
        console.warn('Error fetching tenant profile:', err);
      }

      setProfile({
        id: user.id,
        fullName: user.user_metadata?.full_name || user.user_metadata?.name || 'مستخدم',
        businessName: storeBusinessName || (activeRole !== 'admin' ? 'متجر (حساب موظف)' : 'متجري'),
        storeSlug: user.user_metadata?.storeSlug,
        subscriptionEndDate: subscriptionEndDate
      });
      
      const isUserAdmin = user.email?.startsWith('47071347') || user.email === 'infogrp.target@gmail.com';
      setIsAdmin(isUserAdmin && activeRole === 'admin');

      if (subscriptionEndDate) {
        const end = new Date(subscriptionEndDate);
        const now = new Date();
        const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setDaysRemaining(diff > 0 ? diff : 0);
        
        if (!isUserAdmin && [5, 3, 1].includes(diff) && !sessionStorage.getItem(`trial_modal_shown_${diff}`) && activeRole === 'admin') {
          setShowTrialModal(true);
          sessionStorage.setItem(`trial_modal_shown_${diff}`, 'true');
        }
      }
    };

    fetchUserAndRole();

    // Listen for auth changes (like profile updates)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setProfile(prev => ({
          id: session.user.id,
          fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'مستخدم',
          businessName: session.user.user_metadata?.business_name || prev?.businessName || 'متجري',
          storeSlug: session.user.user_metadata?.storeSlug,
          subscriptionEndDate: prev?.subscriptionEndDate
        }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleLogout = async () => {
    try {
      // Force clear Supabase auth tokens from localStorage to break LockManager deadlocks
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      });
      
      // Delete the entire IndexedDB database to ensure a completely clean slate.
      await db.delete();
      await db.open();
    } catch (e) {
      console.error('Failed to clean storage on logout', e);
    }
    
    try {
      // Try normal sign out, but don't wait forever if locked
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
      ]);
    } catch (e) {
      console.error('Supabase signout failed or timed out', e);
    } finally {
      // Force reload to clear any hung states in memory
      window.location.href = '/auth';
    }
  };

  // Filter items based on user role and permissions
  const hasAccess = (path: string) => {
    return userPermissions.includes('*') || userPermissions.includes(path) || path === '/' || path === '/more';
  };

  const filteredDesktopNav = desktopNavItems.filter(item => hasAccess(item.path) && (item.roles.includes('admin') || item.roles.includes('seller') || item.roles.includes('accountant') || userRole === 'custom'));
  const filteredMobileNav = mobileNavItems.filter(item => hasAccess(item.path) && (item.roles.includes('admin') || item.roles.includes('seller') || item.roles.includes('accountant') || userRole === 'custom'));


  return (
    <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col w-64 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition-transform duration-300 transform md:static md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-dark dark:text-brand-primary">
              <Logo className="w-8 h-8" />
              <span className="text-2xl font-bold tracking-tight">بوصلة</span>
            </div>
            <button 
              className="md:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {profile && (
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div className="overflow-hidden flex-1">
                <p className="font-bold text-sm truncate">{profile.businessName}</p>
                <p className="text-xs text-gray-500 truncate">{profile.fullName}</p>
                <span className="text-[10px] font-mono bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded mt-1 inline-block">
                  {userRole === 'admin' ? 'مدير المتجر' : userRole === 'seller' ? 'بائع / كاشير' : userRole === 'accountant' ? 'محاسب' : 'صلاحيات مخصصة'}
                </span>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {filteredDesktopNav.map((item) => {
            const isActive = location.pathname === item.path;
            const isLocked = isExpired && item.locked && userRole === 'admin';
            return (
              <NavLink
                key={item.path}
                to={isLocked ? '#' : item.path}
                onClick={(e) => {
                  if (isLocked) {
                    e.preventDefault();
                    setShowRenewModal(true);
                  } else {
                    setIsSidebarOpen(false);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  isActive && !isLocked
                    ? "bg-brand-primary/10 text-brand-dark dark:text-brand-primary font-bold" 
                    : isLocked
                    ? "text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && !isLocked ? "text-brand-dark dark:text-brand-primary" : "")} />
                <span className="flex-1">{item.name}</span>
                {isLocked && <Lock className="w-4 h-4 text-orange-500" />}
              </NavLink>
            );
          })}
          {isAdmin && (
            <NavLink
              to={isExpired ? '#' : "/admin"}
              onClick={(e) => {
                if (isExpired) {
                  e.preventDefault();
                  setShowRenewModal(true);
                } else {
                  setIsSidebarOpen(false);
                }
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 mt-4 font-bold",
                isExpired
                  ? "bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 cursor-not-allowed opacity-70"
                  : location.pathname === '/admin' 
                    ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 ring-2 ring-red-500" 
                    : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
              )}
            >
              <Settings className="w-5 h-5" />
              <span className="flex-1">لوحة الإدارة</span>
              {isExpired && <Lock className="w-4 h-4 text-orange-500" />}
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
          {!isInstalled && (isInstallable || isIOS) && (
            <button
              onClick={() => {
                if (isInstallable) {
                  promptInstall();
                } else {
                  navigate('/download');
                }
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors font-bold mb-2"
            >
              <Download className="w-5 h-5" />
              <span>تثبيت التطبيق</span>
            </button>
          )}
          {daysRemaining !== null && (
            <div className="px-3 py-2.5 rounded-xl bg-brand-primary/5 border border-brand-primary/10 flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-brand-primary">
                <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                <span className="text-xs font-bold">{userRole === 'admin' ? 'الاشتراك التجريبي' : 'اشتراك المتجر'}</span>
              </div>
              <span className="text-xs font-black text-brand-primary">{daysRemaining} يوم</span>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-bold">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Smart App Banner */}
        {!isInstalled && (isInstallable || isIOS) && (
          <div className="bg-brand-primary/10 border-b border-brand-primary/20 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
                <Logo className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-sm text-gray-900 dark:text-white">تطبيق بوصلة</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">تجربة أسرع وأفضل على هاتفك</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (isInstallable) {
                  promptInstall();
                } else {
                  navigate('/download');
                }
              }}
              className="bg-brand-primary text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-brand-dark transition-colors shrink-0"
            >
              تثبيت
            </button>
          </div>
        )}

        {/* Trial Banner */}
        {daysRemaining !== null && daysRemaining <= 5 && daysRemaining > 0 && !isAdmin && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2.5 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-2 md:gap-3">
              <AlertCircle className="w-5 h-5 animate-pulse shrink-0" />
              <p className="font-medium text-xs md:text-sm">
                تنبيه: تنتهي الفترة التجريبية الخاصة بك بعد <span className="font-bold">{daysRemaining}</span> {daysRemaining === 1 ? 'يوم' : 'أيام'}. يرجى تجديد الاشتراك لضمان استمرار الخدمة.
              </p>
            </div>
            <NavLink to="/settings" className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition-colors whitespace-nowrap shrink-0">
              تجديد الآن
            </NavLink>
          </div>
        )}

        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -mr-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2 text-brand-dark dark:text-brand-primary">
              <Logo className="w-8 h-8" />
              <span className="text-xl font-bold tracking-tight">بوصلة</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 relative">
          <SyncManager />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-safe z-50">
        <div className="flex items-center justify-around p-2">
          {filteredMobileNav.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/more' && !filteredMobileNav.slice(0, 4).some(nav => nav.path === location.pathname));
            
            if (item.path === '/more') {
              return (
                <button
                  key={item.path}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={cn(
                    "flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors relative",
                    (isActive || isMobileMenuOpen)
                      ? "text-brand-dark dark:text-brand-primary" 
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  )}
                >
                  <item.icon className={cn("w-6 h-6 mb-1", (isActive || isMobileMenuOpen) ? "fill-brand-primary/20" : "")} />
                  <span className="text-[10px] font-medium">{item.name}</span>
                </button>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors",
                  isActive 
                    ? "text-brand-dark dark:text-brand-primary" 
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                )}
              >
                <item.icon className={cn("w-6 h-6 mb-1", isActive ? "fill-brand-primary/20" : "")} />
                <span className="text-[10px] font-medium">{item.name}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Mobile More Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
          <div 
            className="absolute bottom-[72px] left-4 right-4 bg-white dark:bg-gray-900 rounded-3xl p-4 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-4">
              {filteredDesktopNav.filter(item => !filteredMobileNav.slice(0, 4).some(m => m.path === item.path)).map((item) => {
                const isLocked = isExpired && item.locked;
                return (
                  <NavLink
                    key={item.path}
                    to={isLocked ? '#' : item.path}
                    onClick={(e) => {
                      if (isLocked) {
                        e.preventDefault();
                        setIsMobileMenuOpen(false);
                        setShowRenewModal(true);
                      } else {
                        setIsMobileMenuOpen(false);
                      }
                    }}
                    className={({ isActive }) => cn(
                      "flex flex-col items-center justify-center p-3 rounded-2xl transition-all gap-2 relative",
                      isActive && !isLocked
                        ? "bg-brand-primary/10 text-brand-primary" 
                        : isLocked
                        ? "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70"
                        : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-xs font-bold text-center">{item.name}</span>
                    {isLocked && <Lock className="w-4 h-4 text-orange-500 absolute top-2 right-2" />}
                  </NavLink>
                );
              })}
              {isAdmin && (
                <NavLink
                  to={isExpired ? '#' : "/admin"}
                  onClick={(e) => {
                    if (isExpired) {
                      e.preventDefault();
                      setIsMobileMenuOpen(false);
                      setShowRenewModal(true);
                    } else {
                      setIsMobileMenuOpen(false);
                    }
                  }}
                  className={({ isActive }) => cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl transition-all gap-2 relative",
                    isExpired
                      ? "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-70"
                      : isActive 
                        ? "bg-brand-primary/10 text-brand-primary" 
                        : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  )}
                >
                  <Settings className="w-6 h-6" />
                  <span className="text-xs font-bold text-center">لوحة التحكم</span>
                  {isExpired && <Lock className="w-4 h-4 text-orange-500 absolute top-2 right-2" />}
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trial Modal */}
      {showTrialModal && daysRemaining !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-brand-primary to-brand-dark p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full bg-white/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2"></div>
              <div className="relative z-10">
                <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">تنبيه هام</h2>
                <p className="text-white/90 text-lg">
                  تنتهي الفترة التجريبية بعد <span className="font-black text-xl">{daysRemaining}</span> {daysRemaining === 1 ? 'يوم' : 'أيام'}
                </p>
              </div>
            </div>
            <div className="p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                نأمل أن تكون قد استفدت من ميزات تطبيق بوصلة. لضمان عدم انقطاع الخدمة والوصول إلى بياناتك، يرجى تجديد اشتراكك الآن.
              </p>
              <div className="flex flex-col gap-3">
                <NavLink 
                  to="/settings" 
                  onClick={() => setShowTrialModal(false)}
                  className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-sm shadow-brand-primary/20"
                >
                  تجديد الاشتراك الآن
                </NavLink>
                <button 
                  onClick={() => setShowTrialModal(false)}
                  className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-3.5 rounded-xl font-bold transition-colors"
                >
                  تذكيري لاحقاً
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
