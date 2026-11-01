import toast from 'react-hot-toast';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag, 
  Calendar, ArrowUpRight, ArrowDownRight, Lightbulb,
  Package, Users, Clock, AlertTriangle, CheckCircle2,
  Filter, RefreshCw, Target, Zap, Activity, PieChart as PieChartIcon,
  Minus, AlertCircle, ArrowRight, X, ChevronLeft,
  Download, Printer, Loader2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../utils';
import { generateInvoicePDF, printInvoice } from '../utils/pdfGenerator';

import { useNavigate } from 'react-router-dom';

type DateRange = 'today' | 'week' | 'month' | 'year' | 'all';

export default function Reports() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string>('admin');
  
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Raw Data States
  const [salesData, setSalesData] = useState<any[]>([]);
  const [prevSalesData, setPrevSalesData] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [prevExpensesData, setPrevExpensesData] = useState<any[]>([]);
  const [productsData, setProductsData] = useState<any[]>([]);
  const [customersData, setCustomersData] = useState<any[]>([]);
  const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);
  
  // Stock Report States
  const [isPrintingStock, setIsPrintingStock] = useState(false);
  const [isDownloadingStock, setIsDownloadingStock] = useState(false);

  const COLORS = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#10b981', '#f59e0b', '#64748b', '#ec4899', '#14b8a6'];

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data);
        if (data === 'seller') {
          navigate('/');
        }
      }
    });
  }, [navigate]);

  useEffect(() => {
    if (userRole !== 'seller') {
      fetchReportData();
    }
  }, [startDate, endDate, userRole]);

  const fetchReportData = async () => {
    setIsLoading(true);
    await loadData();
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || user.id;

      const startObj = new Date(startDate);
      startObj.setHours(0, 0, 0, 0);
      
      const endObj = new Date(endDate);
      endObj.setHours(23, 59, 59, 999);

      const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
      
      const previousStartDate = new Date(startObj.getTime() - diffTime);
      const previousEndDate = new Date(startObj.getTime() - 1);

      const startIso = startObj.toISOString();
      const endIso = endObj.toISOString();
      
      const prevStartIso = previousStartDate.toISOString();
      const prevEndIso = previousEndDate.toISOString();

      // Fetch Data
      const [
        salesRes, productionRes, expensesRes,
        prevSalesRes, prevProductionRes, prevExpensesRes,
        productsRes, customersRes
      ] = await Promise.all([
        supabase.from('sales').select('*, sale_items(quantity, unit_price, products(id, name, category, purchase_price, unit))').eq('tenant_id', tenantId).gte('created_at', startIso).lte('created_at', endIso).neq('status', 'cancelled'),
        supabase.from('custom_orders').select('*, custom_order_items(fabric_meters, tailoring_cost, product_id, target_product_id)').eq('tenant_id', tenantId).gte('created_at', startIso).lte('created_at', endIso).neq('status', 'cancelled'),
        supabase.from('expenses').select('amount, date, expense_categories(name)').eq('tenant_id', tenantId).gte('date', startIso.split('T')[0]).lte('date', endIso.split('T')[0]),
        
        supabase.from('sales').select('total_amount, created_at').eq('tenant_id', tenantId).gte('created_at', prevStartIso).lt('created_at', prevEndIso).neq('status', 'cancelled'),
        supabase.from('custom_orders').select('total_price, created_at, customer_id').eq('tenant_id', tenantId).gte('created_at', prevStartIso).lt('created_at', prevEndIso).neq('status', 'cancelled'),
        supabase.from('expenses').select('amount').eq('tenant_id', tenantId).gte('date', prevStartIso.split('T')[0]).lt('date', prevEndIso.split('T')[0]),

        supabase.from('products').select('id, name, stock_quantity, category, purchase_price, sell_price, unit').eq('tenant_id', tenantId),
        supabase.from('customers').select('id, name, created_at').eq('tenant_id', tenantId)
      ]);

      if (salesRes.error) console.error("Sales Error:", salesRes.error);
      if (productionRes.error) console.error("Production Error:", productionRes.error);
      if (expensesRes.error) console.error("Expenses Error:", expensesRes.error);
      if (productsRes.error) console.error("Products Error:", productsRes.error);
      if (customersRes.error) console.error("Customers Error:", customersRes.error);

      // Combine Sales and Production Orders for easier processing
      const combinedSales = [
        ...(salesRes.data || []).map(s => ({ ...s, type: 'sale', amount: Number(s.total_amount), items: s.sale_items })),
        ...(productionRes.data || [])
          .filter(o => o.customer_id !== null) // Exclude internal production
          .map(o => ({ ...o, type: 'production', amount: Number(o.total_price), items: o.custom_order_items }))
      ];

      const combinedPrevSales = [
        ...(prevSalesRes.data || []).map(s => ({ amount: Number(s.total_amount) })),
        ...(prevProductionRes.data || [])
          .filter(o => o.customer_id !== null) // Exclude internal production
          .map(o => ({ amount: Number(o.total_price) }))
      ];

      setSalesData(combinedSales);
      setPrevSalesData(combinedPrevSales);
      setExpensesData(expensesRes.data || []);
      setPrevExpensesData(prevExpensesRes.data || []);
      setProductsData(productsRes.data || []);
      setCustomersData(customersRes.data || []);

    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  // --- Data Processing (Memoized for performance) ---

  const processedData = useMemo(() => {
    let currentRevenue = 0;
    let currentCost = 0;
    let currentOrders = salesData.length;
    let currentExpenses = expensesData.reduce((sum, exp) => sum + Number(exp.amount), 0);

    const productStats: Record<string, { id: string, name: string, qty: number, revenue: number, cost: number, category: string }> = {};
    const categoryStats: Record<string, { revenue: number, cost: number }> = {};
    const salesByDate: Record<string, { revenue: number, profit: number }> = {};
    const customerSpending: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};
    const profitBreakdownDetails: any[] = [];

    // Process Expenses by Category
    expensesData.forEach(exp => {
      const catName = exp.expense_categories?.name || 'أخرى';
      const amount = Number(exp.amount) || 0;
      expenseByCategory[catName] = (expenseByCategory[catName] || 0) + amount;
      
      profitBreakdownDetails.push({
        id: exp.id || Math.random().toString(),
        date: exp.date,
        type: 'expense',
        description: `مصروف: ${catName}`,
        revenue: 0,
        cost: amount,
        netProfit: -amount
      });
    });

    // Process Sales
    salesData.forEach(sale => {
      currentRevenue += sale.amount;
      
      const dateKey = new Date(sale.created_at).toISOString().split('T')[0];
      if (!salesByDate[dateKey]) salesByDate[dateKey] = { revenue: 0, profit: 0 };
      salesByDate[dateKey].revenue += sale.amount;

      if (sale.customer_id) {
        customerSpending[sale.customer_id] = (customerSpending[sale.customer_id] || 0) + sale.amount;
      }

      let totalOrderCost = 0;
      let descriptionParts: string[] = [];

      sale.items?.forEach((item: any) => {
        let qty = 1;
        let price = 0;
        let cost = 0;
        let name = 'منتج غير معروف';
        let category = 'أخرى';
        let productId = null;

        if (sale.type === 'production') {
          qty = Number(item.quantity || 1);
          productId = item.target_product_id || item.product_id;
          const product = productsData.find(p => p.id === productId);
          name = product?.name || 'إنتاج';
          category = product?.category || 'إنتاج';
          
          // Note: tailoring_cost and fabric_meters in custom_order_items are ALREADY TOTALS (cost * qty) 
          // because our create_custom_order_v3 RPC handles it that way.
          const fabricPrice = Number(productsData.find(p => p.id === item.product_id)?.purchase_price || 0);
          cost = (fabricPrice * Number(item.fabric_meters || 0)) + Number(item.tailoring_cost || 0);
          
          // Cost per item for stats
          const costPerUnit = qty > 0 ? cost / qty : cost;
          const revenuePerUnit = qty > 0 ? (sale.amount / sale.items.length) / qty : 0;

          descriptionParts.push(`طلب تفصيل (${name})${qty > 1 ? ' x' + qty : ''}`);
          
          totalOrderCost += cost;
          currentCost += cost;

          if (productId) {
            if (!productStats[productId]) {
              productStats[productId] = { id: productId, name, qty: 0, revenue: 0, cost: 0, category };
            }
            productStats[productId].qty += qty;
            productStats[productId].revenue += (sale.amount / (sale.items.length || 1)); // Distribute revenue
            productStats[productId].cost += cost;
          }

          if (!categoryStats[category]) categoryStats[category] = { revenue: 0, cost: 0 };
          categoryStats[category].revenue += (sale.amount / (sale.items.length || 1));
          categoryStats[category].cost += cost;
        } else {
          qty = Number(item.quantity || 1);
          price = Number(item.unit_price || 0);
          productId = item.products?.id;
          name = item.products?.name || 'منتج غير معروف';
          category = item.products?.category || 'أخرى';
          cost = Number(item.products?.purchase_price || 0);
          
          const itemTotalCost = cost * qty;
          const itemTotalRevenue = price * qty;
          
          descriptionParts.push(`${name} (${qty})`);
          
          totalOrderCost += itemTotalCost;
          currentCost += itemTotalCost;

          if (productId) {
            if (!productStats[productId]) {
              productStats[productId] = { id: productId, name, qty: 0, revenue: 0, cost: 0, category };
            }
            productStats[productId].qty += qty;
            productStats[productId].revenue += itemTotalRevenue;
            productStats[productId].cost += itemTotalCost;
          }

          if (!categoryStats[category]) categoryStats[category] = { revenue: 0, cost: 0 };
          categoryStats[category].revenue += itemTotalRevenue;
          categoryStats[category].cost += itemTotalCost;
        }
      });

      salesByDate[dateKey].profit += (sale.amount - totalOrderCost);
      
      // Only include Sales and Real Custom Orders (with customers) in the breakdown
      // Internal production (cust_id is null) is excluded to avoid confusion with deleted orders (0 revenue rows)
      if (sale.type === 'sale' || (sale.type === 'production' && sale.customer_id)) {
        profitBreakdownDetails.push({
          id: sale.id || Math.random().toString(),
          date: sale.created_at,
          type: sale.type === 'production' ? 'production' : 'sale',
          description: descriptionParts.join(' + ') || (sale.type === 'production' ? 'طلب تفصيل' : 'عملية بيع'),
          revenue: sale.amount,
          cost: totalOrderCost,
          netProfit: sale.amount - totalOrderCost
        });
      }
    });

    const currentProfit = currentRevenue - currentCost - currentExpenses;

    // Previous Period Metrics
    const prevRevenue = prevSalesData.reduce((sum, s) => sum + s.amount, 0);
    const prevOrders = prevSalesData.length;
    const prevExpenses = prevExpensesData.reduce((sum, exp) => sum + Number(exp.amount), 0);
    // Estimate prev profit based on current margin
    const currentMargin = currentRevenue > 0 ? (currentRevenue - currentCost) / currentRevenue : 0;
    const prevProfit = (prevRevenue * currentMargin) - prevExpenses;

    const calcGrowth = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / Math.abs(prev)) * 100;

    // Chart Data Formatting
    const trendChartData = Object.entries(salesByDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
        المبيعات: data.revenue,
        الأرباح: data.profit
      }));

    const categoryChartData = Object.entries(categoryStats)
      .map(([name, data]) => ({ name, value: data.revenue }))
      .sort((a, b) => b.value - a.value);

    const productsArray = Object.values(productStats);
    const topProductsChart = [...productsArray].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(p => ({ name: p.name, الإيرادات: p.revenue }));
    const worstProductsChart = [...productsArray].sort((a, b) => a.revenue - b.revenue).slice(0, 5).map(p => ({ name: p.name, الإيرادات: p.revenue }));

    const expensesChartData = Object.entries(expenseByCategory)
      .map(([name, value]) => ({ name, القيمة: value }))
      .sort((a, b) => b.القيمة - a.القيمة);

    // Stock Health
    let outOfStock = 0, lowStock = 0, healthyStock = 0, overStock = 0;
    const stockDetails = { red: [] as any[], yellow: [] as any[], green: [] as any[] };
    
    productsData.forEach(p => {
      const soldQty = productStats[p.id]?.qty || 0;
      const stock = Number(p.stock_quantity);
      
      if (stock === 0) {
        outOfStock++;
        stockDetails.red.push(p);
      } else if (stock <= 5 && soldQty > 0) {
        lowStock++;
        stockDetails.red.push(p);
      } else if (stock > 50 && soldQty < 2) {
        overStock++;
        stockDetails.yellow.push(p);
      } else {
        healthyStock++;
        stockDetails.green.push(p);
      }
    });
    
    const totalProducts = productsData.length || 1;
    const stockHealthScore = Math.round(((healthyStock + (lowStock * 0.5)) / totalProducts) * 100);

    // Customer Insights
    const topCustomers = Object.entries(customerSpending)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, spent]) => {
        const c = customersData.find(c => c.id === id);
        return { name: c?.name || 'عميل غير معروف', spent };
      });

    return {
      metrics: {
        revenue: currentRevenue,
        profit: currentProfit,
        expenses: currentExpenses,
        orders: currentOrders,
        avgOrder: currentOrders > 0 ? currentRevenue / currentOrders : 0,
        revenueGrowth: calcGrowth(currentRevenue, prevRevenue),
        profitGrowth: calcGrowth(currentProfit, prevProfit),
        expensesGrowth: calcGrowth(currentExpenses, prevExpenses),
        ordersGrowth: calcGrowth(currentOrders, prevOrders),
        profitBreakdown: profitBreakdownDetails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      },
      charts: {
        trend: trendChartData,
        category: categoryChartData,
        topProducts: topProductsChart,
        worstProducts: worstProductsChart,
        expenses: expensesChartData
      },
      stock: {
        score: stockHealthScore,
        outOfStock, lowStock, healthyStock, overStock,
        details: stockDetails
      },
      customers: {
        top: topCustomers,
        totalActive: Object.keys(customerSpending).length
      },
      rawStats: {
        products: productsArray,
        categories: categoryStats
      }
    };
  }, [salesData, prevSalesData, expensesData, prevExpensesData, productsData, customersData]);

  // --- AI-like Insights Generation ---
  const generateInsights = () => {
    const { metrics, rawStats, stock, charts } = processedData;
    const insights = [];
    const actions = [];
    let greeting = "";

    // 1. Psychological Greeting
    if (metrics.revenueGrowth > 15) {
      greeting = "أداء استثنائي! متجرك ينمو بقوة هذا الأسبوع. 🚀";
    } else if (metrics.revenueGrowth > 0) {
      greeting = "أداء جيد ومستقر. أنت تسير في الاتجاه الصحيح. 👍";
    } else if (metrics.revenueGrowth < -15) {
      greeting = "هناك تراجع في المبيعات، لكنها فرصة لاكتشاف الخلل والتحسين. 💡";
    } else {
      greeting = "مبيعاتك مستقرة. دعنا نبحث عن فرص جديدة للنمو. 🔍";
    }

    // 2. Smart Insights (3 Cards)
    const smartCards = [];
    
    // Card 1: Profitability or Expense Warning
    const expenseRatio = metrics.revenue > 0 ? (metrics.expenses / metrics.revenue) * 100 : 0;
    if (expenseRatio > 40) {
      smartCards.push({
        title: "نزيف أرباح محتمل",
        desc: `المصروفات تبتلع ${expenseRatio.toFixed(1)}% من إيراداتك. هذا معدل مرتفع قد يؤثر على استدامة متجرك.`,
        icon: AlertTriangle, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-900/20"
      });
      actions.push(`راجع بند مصروفات "${charts.expenses[0]?.name || 'الأعلى'}" لتقليل التكاليف فوراً.`);
    } else if (metrics.profitGrowth > 20) {
      smartCards.push({
        title: "كفاءة مالية عالية",
        desc: "نمو أرباحك يتفوق على نمو مبيعاتك! إدارتك للتكاليف ممتازة جداً هذه الفترة.",
        icon: Target, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20"
      });
    } else {
      smartCards.push({
        title: "هامش الربح",
        desc: `صافي ربحك يمثل ${metrics.revenue > 0 ? ((metrics.profit / metrics.revenue) * 100).toFixed(1) : 0}% من المبيعات.`,
        icon: DollarSign, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20"
      });
    }

    // Card 2: Product Velocity
    const fastProduct = rawStats.products.sort((a, b) => b.qty - a.qty)[0];
    if (fastProduct && fastProduct.qty > 5) {
      smartCards.push({
        title: "منتج يطير من الرفوف",
        desc: `"${fastProduct.name}" يباع بسرعة غير متوقعة (${fastProduct.qty} قطعة).`,
        icon: Zap, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20"
      });
      const prodStock = productsData.find(p => p.id === fastProduct.id)?.stock_quantity || 0;
      if (prodStock < fastProduct.qty) {
        actions.push(`اطلب كميات إضافية من "${fastProduct.name}" فوراً قبل نفاد المخزون.`);
      }
    } else {
      smartCards.push({
        title: "حركة المنتجات",
        desc: "مبيعات المنتجات تتوزع بشكل متقارب دون وجود منتج 'نجم' واضح هذه الفترة.",
        icon: Package, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20"
      });
    }

    // Card 3: Category Opportunity
    let bestCategory = { name: '', margin: 0 };
    Object.entries(rawStats.categories).forEach(([name, data]) => {
      const margin = data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0;
      if (margin > bestCategory.margin && data.revenue > (metrics.revenue * 0.1)) {
        bestCategory = { name, margin };
      }
    });

    if (bestCategory.name) {
      smartCards.push({
        title: "الفئة الذهبية",
        desc: `تصنيف "${bestCategory.name}" يحقق أعلى هامش ربح (${bestCategory.margin.toFixed(0)}%).`,
        icon: Lightbulb, color: "text-brand-primary", bg: "bg-brand-primary/10"
      });
      actions.push(`ركز إعلاناتك وتسويقك على منتجات قسم "${bestCategory.name}" لتعظيم أرباحك.`);
    }

    // Fill remaining actions if needed
    if (actions.length < 3 && stock.overStock > 0) {
      actions.push(`اعمل عرض ترويجي أو خصم للتخلص من المنتجات المكدسة (${stock.overStock} منتج راكد).`);
    }
    if (actions.length < 3 && processedData.customers.totalActive > 0) {
      actions.push(`تواصل مع أفضل عملائك وقدم لهم قسيمة خصم لضمان ولائهم.`);
    }
    if (actions.length < 3) {
      actions.push("قم بإضافة منتجات جديدة لتنويع خيارات العملاء وزيادة المبيعات.");
    }

    return { greeting, smartCards: smartCards.slice(0, 3), actions: actions.slice(0, 3) };
  };

  const aiInsights = useMemo(() => generateInsights(), [processedData]);

  // --- Print/PDF Handlers ---
  const handleGenerateInventoryReport = async (type: 'pdf' | 'print') => {
    try {
      if (type === 'pdf') setIsDownloadingStock(true);
      else setIsPrintingStock(true);

      const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
      
      // 1. Group & Calculate by Category
      const categoryStats: Record<string, { count: number, qty: number, value: number }> = {};
      let totalValue = 0;
      let totalQty = 0;

      productsData.forEach(p => {
         const cat = p.category || 'أخرى / بدون تصنيف';
         const qty = Number(p.stock_quantity) || 0;
         const cost = Number(p.purchase_price) || 0;
         const val = qty * cost;

         if(!categoryStats[cat]) categoryStats[cat] = { count: 0, qty: 0, value: 0 };
         categoryStats[cat].count += 1;
         categoryStats[cat].qty += qty;
         categoryStats[cat].value += val;

         totalValue += val;
         totalQty += qty;
      });

      // 2. Sort products by category so the table is naturally grouped
      const sortedProducts = [...productsData].sort((a, b) => (a.category || 'أخرى').localeCompare(b.category || 'أخرى'));

      const items = sortedProducts.map(p => {
         const price = Number(p.purchase_price || 0);
         const qty = Number(p.stock_quantity || 0);
         return {
            description: `${p.name} - (${p.category || 'بدون تصنيف'})`,
            quantity: qty,
            price: price.toLocaleString() + ' ' + settings.currency,
            total: (qty * price).toLocaleString() + ' ' + settings.currency
         };
      });

      // 3. Build comprehensive summary
      const summary = [
          { label: '--- إحصائيات التصنيفات ---', value: '', isBold: true },
          ...Object.entries(categoryStats)
            .sort((a, b) => b[1].value - a[1].value) // Sort categories by total value descending
            .map(([cat, stats]) => ({
              label: `[${cat}] - (${stats.count} أصناف | ${stats.qty} قطعة)`,
              value: stats.value.toLocaleString() + ' ' + settings.currency
          })),
          { label: '------------------------', value: '' },
          { label: 'العدد الإجمالي للأصناف', value: productsData.length, isBold: true },
          { label: 'العدد الإجمالي للقطع', value: totalQty, isBold: true },
          { label: 'إجمالي قيمة المخزون (رأس المال)', value: totalValue.toLocaleString() + ' ' + settings.currency, isGrandTotal: true }
      ];

      const reportData = {
          title: 'تقرير جرد وتفصيل المخزون',
          invoiceNumber: `STK-${Date.now().toString().slice(-6)}`,
          date: today,
          items,
          summary
      };

      if (type === 'pdf') {
          await generateInvoicePDF(settings, reportData, `تقرير_جرد_المخزون_${new Date().toISOString().split('T')[0]}`);
      } else {
          await printInvoice(settings, reportData);
      }
    } catch (error) {
      console.error('Error generating inventory report:', error);
      toast.error('حدث خطأ أثناء استخراج التقرير. الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsDownloadingStock(false);
      setIsPrintingStock(false);
    }
  };

  // --- Components ---

  const MetricCard = ({ title, value, growth, icon: Icon, format = 'currency', inverseGrowth = false, onClick }: any) => {
    const isPositive = growth > 0;
    const isNegative = growth < 0;
    const isNeutral = growth === 0;
    
    // For expenses, growth is bad (red), decrease is good (green)
    const goodColor = inverseGrowth ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20" : "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20";
    const badColor = inverseGrowth ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" : "text-rose-600 bg-rose-50 dark:bg-rose-900/20";
    const neutralColor = "text-gray-600 bg-gray-50 dark:bg-gray-800";

    const growthColor = isNeutral ? neutralColor : (isPositive ? goodColor : badColor);
    const GrowthIcon = isNeutral ? Minus : (isPositive ? ArrowUpRight : ArrowDownRight);

    return (
      <div 
        onClick={onClick}
        className={cn("bg-white dark:bg-gray-900 rounded-2xl p-5 border shadow-sm transition-all relative group", onClick ? "border-gray-200 dark:border-gray-700 cursor-pointer hover:border-brand-primary hover:shadow-md" : "border-gray-100 dark:border-gray-800 hover:shadow-md")}
      >
        {onClick && (
          <div className="absolute left-4 top-4 text-xs font-bold text-gray-400 group-hover:text-brand-primary flex items-center gap-1 transition-colors">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">التفاصيل</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        )}
        <div className="flex justify-between items-start mb-4">
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl">
            <Icon className="w-5 h-5" />
          </div>
          <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg", growthColor)}>
            <GrowthIcon className="w-3.5 h-3.5" />
            {Math.abs(growth).toFixed(1)}%
          </div>
        </div>
        <div>
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{title}</h3>
          <p className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {format === 'currency' ? `${value.toLocaleString()} ${settings.currency}` : value.toLocaleString()}
          </p>
        </div>
      </div>
    );
  };

  if (isLoading && !isRefreshing) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">جاري تحليل بيانات متجرك...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 pb-24">
      
      {/* 1. Smart Controls & Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-brand-primary" />
            التقارير الذكية
          </h1>
          <p className="text-brand-primary font-bold text-lg">
            {aiInsights.greeting}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
            <div className="flex items-center px-2">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400">من</span>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="bg-transparent border-none text-sm font-bold text-gray-700 dark:text-gray-200 focus:ring-0 cursor-pointer"
              />
            </div>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <div className="flex items-center px-2">
              <span className="text-sm font-bold text-gray-500 dark:text-gray-400">إلى</span>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="bg-transparent border-none text-sm font-bold text-gray-700 dark:text-gray-200 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-5 h-5", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* 2. Smart Insights (The Core) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {aiInsights.smartCards.map((card, idx) => (
          <div key={idx} className={cn("rounded-3xl p-6 border border-transparent transition-transform hover:-translate-y-1", card.bg)}>
            <div className="flex items-center gap-3 mb-4">
              <div className={cn("p-2.5 bg-white/50 dark:bg-black/20 rounded-xl backdrop-blur-sm", card.color)}>
                <card.icon className="w-6 h-6" />
              </div>
              <h3 className={cn("font-bold text-lg", card.color)}>{card.title}</h3>
            </div>
            <p className="text-gray-800 dark:text-gray-200 font-medium leading-relaxed">
              {card.desc}
            </p>
          </div>
        ))}
      </div>

      {/* 3. Performance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard title="إجمالي المبيعات" value={processedData.metrics.revenue} growth={processedData.metrics.revenueGrowth} icon={DollarSign} />
        <MetricCard title="الأرباح (تقديري)" value={processedData.metrics.profit} growth={processedData.metrics.profitGrowth} icon={TrendingUp} onClick={() => setIsProfitModalOpen(true)} />
        <MetricCard title="المصاريف" value={processedData.metrics.expenses} growth={processedData.metrics.expensesGrowth} icon={TrendingDown} inverseGrowth={true} />
        <MetricCard title="عدد الفواتير" value={processedData.metrics.orders} growth={processedData.metrics.ordersGrowth} icon={ShoppingBag} format="number" />
      </div>

      {/* 4. Visual Intelligence (Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-primary" />
              مبيعات وأرباح عبر الزمن
            </h3>
          </div>
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={processedData.charts.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dx={-10} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" name="المبيعات" dataKey="المبيعات" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" name="الأرباح" dataKey="الأرباح" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales by Category */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-purple-500" />
            توزيع المبيعات
          </h3>
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={processedData.charts.category}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {processedData.charts.category.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: number) => `${value.toLocaleString()} ${settings.currency}`}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Hidden Insights & Stock Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Hidden Insights */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-rose-500" />
            اكتشافات ذكية (Hidden Insights)
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">المنتج الأسرع مبيعاً</p>
                <p className="font-bold text-gray-900 dark:text-white mt-1">
                  {processedData.charts.topProducts[0]?.name || 'لا يوجد بيانات'}
                </p>
              </div>
              <div className="text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">المنتج الأبطأ (يحتاج تسويق)</p>
                <p className="font-bold text-gray-900 dark:text-white mt-1">
                  {processedData.charts.worstProducts[0]?.name || 'لا يوجد بيانات'}
                </p>
              </div>
              <div className="text-rose-500 bg-rose-50 dark:bg-rose-900/20 p-2 rounded-xl">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">أفضل عميل هذه الفترة</p>
                <p className="font-bold text-gray-900 dark:text-white mt-1">
                  {processedData.customers.top[0]?.name || 'لا يوجد بيانات'}
                </p>
              </div>
              <div className="text-blue-500 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Stock Health */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              صحة المخزون
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">المؤشر العام:</span>
              <span className={cn(
                "px-3 py-1 rounded-full text-sm font-bold",
                processedData.stock.score > 70 ? "bg-emerald-100 text-emerald-700" :
                processedData.stock.score > 40 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
              )}>
                {processedData.stock.score}/100
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <p className="text-2xl font-black text-rose-600 mb-1">{processedData.stock.outOfStock}</p>
              <p className="text-xs font-medium text-rose-600/80">نفدت / توشك</p>
            </div>
            <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/30">
              <p className="text-2xl font-black text-amber-600 mb-1">{processedData.stock.overStock}</p>
              <p className="text-xs font-medium text-amber-600/80">مكدسة (راكدة)</p>
            </div>
            <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <p className="text-2xl font-black text-emerald-600 mb-1">{processedData.stock.healthyStock}</p>
              <p className="text-xs font-medium text-emerald-600/80">متوازنة</p>
            </div>
          </div>

          {processedData.stock.details.red.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-rose-600 mb-2 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> تحتاج طلب عاجل:
              </p>
              <div className="flex flex-wrap gap-2">
                {processedData.stock.details.red.slice(0, 4).map(p => (
                  <span key={p.id} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg">
                    {p.name}
                  </span>
                ))}
                {processedData.stock.details.red.length > 4 && <span className="text-xs px-2.5 py-1 text-gray-500">+{processedData.stock.details.red.length - 4} أخرى</span>}
              </div>
            </div>
          )}

          {/* Generate Inventory Report Action */}
          <div className="mt-auto pt-6 border-t border-gray-100 dark:border-gray-800">
             <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">جرد المخزون (ستوكاج)</p>
                  <p className="text-xs text-gray-500 mt-1 pb-1">تقرير بحالة وقيمة المنتجات</p>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={() => handleGenerateInventoryReport('print')}
                     disabled={isPrintingStock || isDownloadingStock || productsData.length === 0}
                     className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
                     title="طباعة"
                   >
                     {isPrintingStock ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                   </button>
                   <button 
                     onClick={() => handleGenerateInventoryReport('pdf')}
                     disabled={isPrintingStock || isDownloadingStock || productsData.length === 0}
                     className="p-2 px-3 bg-brand-primary text-white hover:bg-brand-secondary rounded-xl transition-colors flex items-center gap-2 text-sm font-bold disabled:opacity-50"
                   >
                     {isDownloadingStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                     <span className="hidden sm:inline">PDF</span>
                   </button>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 6. Expenses Analysis */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-rose-500" />
          تحليل المصروفات
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="h-[250px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedData.charts.expenses} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" opacity={0.5} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 12, fontWeight: 500 }} width={100} />
                <RechartsTooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="القيمة" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">نسبة المصاريف من المبيعات</p>
              <div className="flex items-end gap-3">
                <p className="text-3xl font-black text-gray-900 dark:text-white">
                  {processedData.metrics.revenue > 0 ? ((processedData.metrics.expenses / processedData.metrics.revenue) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-sm text-gray-500 mb-1">المعدل الصحي: أقل من 30%</p>
              </div>
            </div>
            <div className="p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">أكبر بند صرف</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {processedData.charts.expenses[0]?.name || 'لا يوجد'} 
                <span className="text-sm font-normal text-gray-500 mr-2">
                  ({processedData.charts.expenses[0]?.القيمة.toLocaleString() || 0} {settings.currency})
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Actionable Steps (What to do now?) */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-black dark:to-gray-900 rounded-3xl p-8 shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-brand-primary rounded-2xl shadow-lg shadow-brand-primary/30">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">ماذا تفعل الآن؟</h2>
              <p className="text-gray-400 font-medium mt-1">خطوات عملية مقترحة بناءً على تحليل بياناتك</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiInsights.actions.map((action, idx) => (
              <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex gap-4 hover:bg-white/15 transition-colors group">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 group-hover:bg-brand-primary transition-colors">
                  <span className="font-bold text-sm">{idx + 1}</span>
                </div>
                <p className="text-gray-100 font-medium leading-relaxed pt-1">
                  {action}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isProfitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">تفصيل الأرباح</h2>
                  <p className="text-sm text-gray-500 font-medium">تحليل الدخل والمصروفات للفترة المحددة</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProfitModalOpen(false)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Summary Cards */}
              <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-gray-100 dark:border-gray-800">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">إجمالي الإيرادات (مبيعات + طلبات)</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                    {processedData.metrics.revenue.toLocaleString()} {settings.currency}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">إجمالي التكاليف والمصروفات</p>
                  <p className="text-2xl font-black text-rose-700 dark:text-rose-300">
                    {(processedData.metrics.revenue - processedData.metrics.profit).toLocaleString()} {settings.currency}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-brand-primary/5 border border-brand-primary/20">
                  <p className="text-xs font-bold text-brand-primary mb-1">صافي الربح التقديري</p>
                  <p className="text-2xl font-black text-brand-primary">
                    {processedData.metrics.profit.toLocaleString()} {settings.currency}
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="p-4 sm:p-6">
                <div className="border border-gray-100 dark:border-gray-800 rounded-2xl overflow-x-auto shadow-sm">
                  <table className="w-full text-right text-sm whitespace-nowrap min-w-[700px]">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-4 font-bold">التاريخ</th>
                        <th className="px-4 py-4 font-bold">نوع العملية</th>
                        <th className="px-4 py-4 font-bold">التفاصيل</th>
                        <th className="px-4 py-4 font-bold">الإيراد</th>
                        <th className="px-4 py-4 font-bold">التكلفة</th>
                        <th className="px-4 py-4 font-bold">صافي الربح</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {processedData.metrics.profitBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">لا توجد عمليات مسجلة في هذه الفترة</td>
                        </tr>
                      ) : (
                        processedData.metrics.profitBreakdown.map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                              {new Date(item.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold",
                                item.type === 'expense' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
                                item.type === 'production' ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" :
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              )}>
                                {item.type === 'expense' ? 'مصروف' : item.type === 'production' ? 'طلب تفصيل' : 'مبيعات'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-900 dark:text-white font-medium max-w-[200px] sm:max-w-[300px] truncate" title={item.description}>
                              {item.description}
                            </td>
                            <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">
                              {item.revenue > 0 ? `+${item.revenue.toLocaleString()}` : '0'}
                            </td>
                            <td className="px-4 py-3 text-rose-600 dark:text-rose-400 font-bold">
                              {item.cost > 0 ? `-${item.cost.toLocaleString()}` : '0'}
                            </td>
                            <td className="px-4 py-3 font-black">
                              <span className={item.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                                {item.netProfit > 0 ? '+' : ''}{item.netProfit.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
