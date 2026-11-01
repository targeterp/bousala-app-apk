import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Users, Package, CreditCard, 
  AlertCircle, ArrowUpRight, ShoppingCart, PlusCircle, 
  MessageCircle, Clock, ChevronLeft, Loader2, UserPlus
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { supabase } from '../lib/supabase';
import { cn } from '../utils';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';

import { db } from '../lib/db';

export function Dashboard() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('admin');
  
  // Data States
  const [rawData, setRawData] = useState<{
    salesData: any[];
    customOrdersData: any[];
    saleItemsData: any[];
    customersData: any[];
    productsData: any[];
    expensesData: any[];
  }>(() => {
    try {
      const tenantId = localStorage.getItem('target_tenant_id') || 'default';
      const cached = localStorage.getItem(`target_dashboard_cache_${tenantId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
    return {
      salesData: [],
      customOrdersData: [],
      saleItemsData: [],
      customersData: [],
      productsData: [],
      expensesData: []
    };
  });

  const [stats, setStats] = useState({
    todaySales: 0,
    salesTrend: 0,
    totalDebt: 0,
    activeCustomers: 0,
    totalExpenses: 0
  });
  const [salesChartData, setSalesChartData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [topDebtors, setTopDebtors] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  const [summaryPeriod, setSummaryPeriod] = useState<'daily' | 'weekly'>('weekly');

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data);
      }
    });
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;
      if (!userId) {
        setIsLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // We need max 14 days of data for weekly comparison
      const fourteenDaysAgo = new Date(today);
      fourteenDaysAgo.setDate(today.getDate() - 13);
      fourteenDaysAgo.setMilliseconds(-1);

      // 1. Fetch from Supabase (Sync)
      // We will always fetch the last 7 days for the chart
      const chartStartDate = new Date(today);
      chartStartDate.setDate(today.getDate() - 6);

      // Fetch Sales with their items
      const { data: salesData } = await supabase
        .from('sales')
        .select(`
          *,
          customers(name),
          sale_items(
            *,
            products(name)
          )
        `)
        .gte('created_at', fourteenDaysAgo.toISOString()) 
        .order('created_at', { ascending: false });

      // Fetch Custom Orders
      const { data: customOrdersData } = await supabase
        .from('custom_orders')
        .select('*, customers(name)')
        .gte('created_at', fourteenDaysAgo.toISOString()) 
        .order('created_at', { ascending: false });

      const saleItemsData = salesData?.flatMap(s => s.sale_items || []) || [];

      // Fetch Customers
      const { data: customersData } = await supabase
        .from('customers')
        .select('*')
        .order('balance', { ascending: false });

      // Fetch Products
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, stock_quantity, unit')
        .eq('tenant_id', userId)
        .order('stock_quantity', { ascending: true });

      // Fetch Expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('*, expense_categories(name)')
        .gte('date', fourteenDaysAgo.toISOString().split('T')[0]);

      const newRawData = {
        salesData: salesData || [],
        customOrdersData: customOrdersData || [],
        saleItemsData: saleItemsData || [],
        customersData: customersData || [],
        productsData: productsData || [],
        expensesData: expensesData || [],
      };
      
      setRawData(newRawData);
      
      try {
        const tenantId = localStorage.getItem('target_tenant_id') || 'default';
        localStorage.setItem(`target_dashboard_cache_${tenantId}`, JSON.stringify(newRawData));
      } catch (e) {
        // Ignore quota errors
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!rawData) return;
    
    // Process data based on summaryPeriod
    const { salesData, customOrdersData, saleItemsData, customersData, productsData, expensesData } = rawData;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate = new Date(today);
    let previousStartDate = new Date(today);
    let previousEndDate = new Date(today);

    if (summaryPeriod === 'daily') {
      startDate = today;
      previousStartDate.setDate(today.getDate() - 1);
      previousEndDate = new Date(today);
      previousEndDate.setMilliseconds(-1); // End of yesterday
    } else {
      startDate.setDate(today.getDate() - 6);
      previousStartDate.setDate(today.getDate() - 13);
      previousEndDate = new Date(startDate);
      previousEndDate.setMilliseconds(-1);
    }

    const chartStartDate = new Date(today);
    chartStartDate.setDate(today.getDate() - 6);

    // --- Process Data ---
    const currentPeriodSales = salesData.filter(s => new Date(s.created_at) >= startDate);
    const currentPeriodOrders = customOrdersData.filter(s => new Date(s.created_at) >= startDate);
      
    const previousPeriodSales = salesData.filter(s => new Date(s.created_at) >= previousStartDate && new Date(s.created_at) <= previousEndDate);
    const previousPeriodOrders = customOrdersData.filter(s => new Date(s.created_at) >= previousStartDate && new Date(s.created_at) <= previousEndDate);
      
    const currentSalesTotal = currentPeriodSales.reduce((sum, s) => sum + Number(s.total_amount), 0) + currentPeriodOrders.reduce((sum, s) => sum + Number(s.total_price), 0);
    const previousSalesTotal = previousPeriodSales.reduce((sum, s) => sum + Number(s.total_amount), 0) + previousPeriodOrders.reduce((sum, s) => sum + Number(s.total_price), 0);
      
    let salesTrend = 0;
    if (previousSalesTotal > 0) {
      salesTrend = Math.round(((currentSalesTotal - previousSalesTotal) / previousSalesTotal) * 100);
    } else if (currentSalesTotal > 0) {
      salesTrend = 100;
    }

    const totalDebt = customersData.reduce((sum, c) => sum + (Number(c.balance) > 0 ? Number(c.balance) : 0), 0) || 0;
      
    const activeCustomersCurrent = new Set([
      ...currentPeriodSales.filter(s => s.customer_id).map(s => s.customer_id),
      ...currentPeriodOrders.filter(o => o.customer_id).map(o => o.customer_id)
    ]).size;
      
    const currentExpenses = expensesData.filter(e => new Date(e.date) >= startDate);
    const totalExpenses = currentExpenses.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

    setStats({
      todaySales: currentSalesTotal, 
      salesTrend,
      totalDebt,
      activeCustomers: activeCustomersCurrent,
      totalExpenses
    });

    // 2. Chart Data (Always Last 7 Days for visual consistency)
    const chartSalesList = salesData.filter(s => new Date(s.created_at) >= chartStartDate) || [];
    const chartOrdersList = customOrdersData.filter(s => new Date(s.created_at) >= chartStartDate) || [];
      
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('ar-EG', { weekday: 'short' });
        
      const daySales = chartSalesList.filter(s => {
        const sd = new Date(s.created_at);
        return sd.getDate() === d.getDate() && sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
      }).reduce((sum, s) => sum + Number(s.total_amount), 0);
        
      const dayOrders = chartOrdersList.filter(s => {
        const sd = new Date(s.created_at);
        return sd.getDate() === d.getDate() && sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear();
      }).reduce((sum, s) => sum + Number(s.total_price), 0);

      chartData.push({ name: dateStr, total: daySales + dayOrders });
    }
    setSalesChartData(chartData);

    // 3. Top Products
    const productSalesMap = new Map();
    
    // Get sale items only for the current period
    const currentPeriodSaleItems = currentPeriodSales.flatMap(s => s.sale_items || []);
    currentPeriodSaleItems.forEach(item => {
      const productName = item.products?.name || 'منتج غير معروف';
      const current = productSalesMap.get(productName) || { quantity: 0, revenue: 0 };
      productSalesMap.set(productName, {
        quantity: current.quantity + Number(item.quantity),
        revenue: current.revenue + Number(item.total_price || (item.quantity * item.unit_price))
      });
    });
    
    // Allow custom orders to be in top products
    currentPeriodOrders.forEach(order => {
       if (order.target_product_id) {
          const productName = "طلب تفصيل"; 
          const current = productSalesMap.get(productName) || { quantity: 0, revenue: 0 };
          productSalesMap.set(productName, {
            quantity: current.quantity + 1,
            revenue: current.revenue + Number(order.total_price)
          });
       }
    });
      
    const topProductsList = Array.from(productSalesMap.entries())
      .map(([name, data]) => ({ name, value: data.revenue })) 
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setTopProducts(topProductsList);

    // 4. Expenses by Category
    const expenseByCategoryMap = new Map();
    currentExpenses.forEach(exp => {
      const catName = exp.expense_categories?.name || 'أخرى';
      const current = expenseByCategoryMap.get(catName) || 0;
      expenseByCategoryMap.set(catName, current + Number(exp.amount));
    });
    const expensesByCategoryList = Array.from(expenseByCategoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    setExpensesByCategory(expensesByCategoryList);

    // 5. Alerts
    setLowStock(productsData.filter(p => p.stock_quantity < 10).slice(0, 4) || []);
    setTopDebtors(customersData.filter(c => c.balance > 0).slice(0, 4) || []);
      
    // 6. Recent Activity
    const combinedOperations = [
        ...salesData.map(s => ({ ...s, type: 'sale', label: 'مبيعات' })),
        ...customOrdersData.map(o => ({ ...o, type: 'order', label: 'طلب تفصيل', total_amount: o.total_price }))
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
    setRecentSales(combinedOperations.slice(0, 5));

  }, [summaryPeriod, rawData]);

  const handleWhatsAppReminder = (phone: string, name: string, debt: number) => {
    const message = `مرحباً ${name}،\nنود تذكيركم بأن هناك رصيد مستحق بقيمة ${debt.toLocaleString()} ${settings.currency}.\nنسعد بتواصلكم لتسوية الرصيد. شكراً لتعاملكم معنا!`;
    const formattedPhone = phone.replace(/^0+/, '');
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">نظرة عامة</h1>
            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-brand-primary/60" />}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">مرحباً بك في لوحة القيادة الذكية لمتجرك.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex items-center shrink-0">
            <button
              onClick={() => setSummaryPeriod('daily')}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-lg transition-all",
                summaryPeriod === 'daily' 
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              اليومية
            </button>
            <button
              onClick={() => setSummaryPeriod('weekly')}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-lg transition-all",
                summaryPeriod === 'weekly' 
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              أسبوعية
            </button>
          </div>
          <button 
            onClick={() => navigate('/sales')}
            className="bg-brand-primary hover:bg-brand-primary/90 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 text-sm flex-1 sm:flex-none"
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span>بيع جديد</span>
          </button>
        </div>
      </div>

      {/* 1. Financial Pulse Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Weekly Sales */}
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className={cn(
              "flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2 py-1 rounded-lg",
              stats.salesTrend >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-red-600 bg-red-50 dark:bg-red-900/20"
            )}>
              {stats.salesTrend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span dir="ltr">{Math.abs(stats.salesTrend)}%</span>
            </div>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">
              {summaryPeriod === 'daily' ? 'مبيعات اليوم' : 'مبيعات الأسبوع'}
            </p>
            <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">{stats.todaySales.toLocaleString()} <span className="text-xs sm:text-sm font-bold text-gray-400">{settings.currency}</span></h3>
          </div>
        </div>

        {/* Weekly Expenses */}
        {userRole !== 'seller' && (
          <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">
                {summaryPeriod === 'daily' ? 'مصاريف اليوم' : 'مصاريف الأسبوع'}
              </p>
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">{stats.totalExpenses.toLocaleString()} <span className="text-xs sm:text-sm font-bold text-gray-400">{settings.currency}</span></h3>
            </div>
          </div>
        )}

        {/* Total Debt */}
        {userRole !== 'seller' && (
          <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-50 dark:bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">إجمالي الديون</p>
              <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">{stats.totalDebt.toLocaleString()} <span className="text-xs sm:text-sm font-bold text-gray-400">{settings.currency}</span></h3>
            </div>
          </div>
        )}

        {/* Active Customers */}
        <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">العملاء النشطون</p>
            <h3 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">{stats.activeCustomers} <span className="text-xs sm:text-sm font-bold text-gray-400">عميل</span></h3>
          </div>
        </div>
      </div>

      {/* 2. Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">مؤشر المبيعات (آخر 7 أيام)</h2>
          </div>
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} tickFormatter={(value) => `${value >= 1000 ? (value/1000)+'k' : value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', backgroundColor: '#fff', color: '#111827', fontWeight: 'bold' }}
                  itemStyle={{ color: '#F27D26' }}
                  formatter={(value: number) => [`${value.toLocaleString()} ${settings.currency}`, 'المبيعات']}
                  labelStyle={{ color: '#6b7280', marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="total" stroke="#F27D26" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products Chart */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              الأكثر مبيعاً {summaryPeriod === 'daily' ? '(اليوم)' : '(هذا الأسبوع)'}
            </h2>
          </div>
          {topProducts.length === 0 ? (
            <div className="h-[250px] flex flex-col items-center justify-center text-gray-400">
              <Package className="w-12 h-12 opacity-20 mb-2" />
              <p className="text-sm font-medium">لا توجد بيانات كافية</p>
            </div>
          ) : (
            <div className="h-[300px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: number) => [`${value.toLocaleString()} ${settings.currency}`, 'المبيعات']}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {topProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#00A372', '#21C55E', '#34D399', '#6EE7B7', '#A7F3D0'][index % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 3. Expenses by Category Chart */}
      {userRole !== 'seller' && (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">المصاريف حسب الفئة</h2>
          </div>
          {expensesByCategory.length === 0 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-gray-400">
              <CreditCard className="w-12 h-12 opacity-20 mb-2" />
              <p className="text-sm font-medium">لا توجد مصاريف مسجلة</p>
            </div>
          ) : (
            <div className="h-[250px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expensesByCategory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: number) => [`${value.toLocaleString()} ${settings.currency}`, 'المبلغ']}
                  />
                  <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 4. Bento Grid: Alerts, Actions, Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Smart Alerts */}
        <div className="space-y-4">
          {/* Low Stock Alert */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-red-100 dark:border-red-900/30 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-2 bg-red-500 h-full group-hover:w-3 transition-all" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500" />
              تنبيهات المخزون (أوشك على النفاد)
            </h3>
            {lowStock.length === 0 ? (
              <p className="text-sm text-gray-500">المخزون بحالة جيدة.</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-red-50/50 dark:bg-red-900/10 p-3 rounded-2xl border border-red-100/50 dark:border-red-900/20 hover:scale-[1.02] transition-transform">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 dark:bg-red-900/30 text-red-600 rounded-xl flex items-center justify-center font-bold text-xs px-2 py-1">
                        {p.stock_quantity} {p.unit || 'قطعة'}
                      </div>
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300 line-clamp-1">{p.name}</span>
                    </div>
                    <button onClick={() => navigate('/products')} className="text-red-500 hover:text-red-600 transition-colors">
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Debt Alert */}
          <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-orange-100 dark:border-orange-900/30 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-2 bg-orange-500 h-full group-hover:w-3 transition-all" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-orange-500" />
              أكبر الديون المستحقة
            </h3>
            {topDebtors.length === 0 ? (
              <p className="text-sm text-gray-500">لا توجد ديون مستحقة.</p>
            ) : (
              <div className="space-y-2">
                {topDebtors.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-orange-50/50 dark:bg-orange-900/10 p-3 rounded-2xl border border-orange-100/50 dark:border-orange-900/20 hover:scale-[1.02] transition-transform">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-300 line-clamp-1">{c.name}</p>
                      <p className="text-xs text-orange-600 font-black">{Number(c.balance).toLocaleString()} {settings.currency}</p>
                    </div>
                    <button 
                      onClick={() => handleWhatsAppReminder(c.phone, c.name, c.balance)}
                      className="w-10 h-10 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white rounded-xl flex items-center justify-center transition-all shrink-0 shadow-sm"
                      title="إرسال تذكير واتساب"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-5">إجراءات سريعة</h3>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => navigate('/sales')} className="flex flex-col items-center justify-center gap-3 p-5 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/10 rounded-3xl transition-all hover:scale-[1.05] group">
              <div className="w-12 h-12 bg-brand-primary text-white rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-brand-primary/20">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <span className="text-sm font-black text-brand-dark">فاتورة جديدة</span>
            </button>
            
            <button onClick={() => navigate('/products')} className="flex flex-col items-center justify-center gap-3 p-5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/10 dark:hover:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-3xl transition-all hover:scale-[1.05] group">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-blue-500/20">
                <PlusCircle className="w-6 h-6" />
              </div>
              <span className="text-sm font-black text-blue-700 dark:text-blue-400">إضافة منتج</span>
            </button>

            <button onClick={() => navigate('/customers')} className="flex flex-col items-center justify-center gap-3 p-5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-3xl transition-all hover:scale-[1.05] group">
              <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-emerald-500/20">
                <UserPlus className="w-6 h-6" />
              </div>
              <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">عميل جديد</span>
            </button>

            {userRole !== 'seller' && (
              <button
                onClick={() => navigate('/expenses')}
                className="flex flex-col items-center justify-center gap-3 p-5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/10 dark:hover:bg-purple-900/20 border border-purple-100 dark:border-purple-800/30 rounded-3xl transition-all hover:scale-[1.05] group"
              >
                <div className="w-12 h-12 bg-purple-500 text-white rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-purple-500/20">
                  <CreditCard className="w-6 h-6" />
                </div>
                <span className="text-sm font-black text-purple-700 dark:text-purple-400">إضافة مصروف</span>
              </button>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">أحدث المبيعات</h3>
            <button onClick={() => navigate('/sales')} className="text-brand-primary text-sm font-bold hover:underline flex items-center gap-1">
              عرض الكل <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
            {recentSales.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Clock className="w-10 h-10 opacity-20 mb-2" />
                <p className="text-sm font-medium">لا توجد مبيعات حديثة</p>
              </div>
            ) : (
              recentSales.map((sale, i) => (
                <div key={sale.id} className="relative pl-4">
                  {i !== recentSales.length - 1 && (
                    <div className="absolute right-2 top-8 bottom-[-16px] w-[2px] bg-gray-100 dark:bg-gray-800" />
                  )}
                  <div className="flex items-start gap-4">
                    <div className="w-4 h-4 rounded-full bg-brand-primary/20 border-2 border-brand-primary shrink-0 mt-1.5 z-10" />
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800 transition-all shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-black text-gray-900 dark:text-white">
                          {sale.customers?.name || 'عميل عام'}
                        </p>
                        <p className="text-brand-primary font-black text-base">
                          {Number(sale.total_amount).toLocaleString()} <span className="text-[10px]">{settings.currency}</span>
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className={cn(
                          "px-2 py-1 rounded-lg font-bold",
                          sale.status === 'completed' ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                        )}>
                          {sale.status === 'completed' ? 'مكتملة' : 'قيد الانتظار'}
                        </span>
                        <span className="text-gray-400 font-medium">{new Date(sale.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
