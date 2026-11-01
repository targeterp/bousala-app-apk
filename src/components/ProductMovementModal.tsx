import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Loader2, ArrowUpRight, ArrowDownLeft, ArrowUpDown, 
  Flame, Clock, AlertTriangle, CheckCircle2, DollarSign, 
  Package, ShoppingCart, Calendar, Building2, RotateCw,
  TrendingUp, Printer, Filter
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../utils';

export type ProductMovementModalProps = {
  product: {
    id: string;
    name: string;
    stock_quantity: number;
    unit?: string;
    purchase_price?: number;
    sell_price?: number;
    category?: string;
    created_at?: string;
  } | null;
  onClose: () => void;
};

type MovementEvent = {
  id: string;
  type: 'sale' | 'purchase' | 'adjustment' | 'split_in' | 'split_out';
  date: string;
  quantityChange: number;
  unitPrice?: number;
  totalPrice?: number;
  referenceId?: string;
  partyName?: string;
  note?: string;
};

export function ProductMovementModal({ product, onClose }: ProductMovementModalProps) {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'purchases' | 'adjustments'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [movements, setMovements] = useState<MovementEvent[]>([]);

  // Default to 1 month (last 30 days) as requested
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [preset, setPreset] = useState<'month' | '7days' | '3months' | 'all' | 'custom'>('month');

  useEffect(() => {
    if (!product?.id) return;
    loadProductMovements();
  }, [product?.id]);

  const setDateRangePreset = (p: 'month' | '7days' | '3months' | 'all') => {
    setPreset(p);
    const today = new Date().toISOString().split('T')[0];
    if (p === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (p === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (p === '3months') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(today);
    } else if (p === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadProductMovements = async () => {
    if (!product?.id) return;
    setIsLoading(true);

    try {
      const allEvents: MovementEvent[] = [];
      const seenSaleItemIds = new Set<string>();

      // 1. Fetch Sales Items from Supabase (safe query without sale_items.created_at)
      try {
        const { data: salesItems, error: salesErr } = await supabase
          .from('sale_items')
          .select(`
            id,
            quantity,
            unit_price,
            total_price,
            sale_id,
            sales (
              id,
              created_at,
              status,
              customer_id,
              customers (
                name
              )
            )
          `)
          .eq('product_id', product.id);

        if (salesErr) {
          console.warn('Supabase sale_items query error:', salesErr);
        } else if (salesItems) {
          salesItems.forEach((item: any) => {
            if (item.sales?.status === 'cancelled') return;
            seenSaleItemIds.add(item.id);
            const dateStr = item.sales?.created_at || new Date().toISOString();
            const qty = Math.abs(Number(item.quantity || 0));
            const uPrice = Number(item.unit_price || 0);
            const tPrice = Number(item.total_price || qty * uPrice);

            allEvents.push({
              id: `sale-${item.id}`,
              type: 'sale',
              date: dateStr,
              quantityChange: -qty,
              unitPrice: uPrice,
              totalPrice: tPrice,
              referenceId: item.sale_id ? `فاتورة #${String(item.sale_id).substring(0, 8)}` : 'مبيعات',
              partyName: item.sales?.customers?.name || 'عميل نقدي / عام',
              note: 'عملية بيع'
            });
          });
        }
      } catch (err) {
        console.warn('Error querying remote sales items:', err);
      }

      // 2. Augment from Dexie local IndexedDB (guarantees offline sales and local cash sales appear!)
      try {
        const localItems = await db.sale_items.where('product_id').equals(product.id).toArray();
        for (const item of localItems) {
          if (!seenSaleItemIds.has(item.id)) {
            const sale = await db.sales.get(item.sale_id);
            if (sale && sale.status !== 'cancelled') {
              let custName = 'عميل نقدي / عام';
              if (sale.customer_id) {
                const customer = await db.customers.get(sale.customer_id);
                if (customer?.name) custName = customer.name;
              }
              const qty = Math.abs(Number(item.quantity || 0));
              const uPrice = Number(item.unit_price || 0);
              const tPrice = Number(item.total_price || qty * uPrice);

              allEvents.push({
                id: `sale-local-${item.id}`,
                type: 'sale',
                date: sale.created_at || new Date().toISOString(),
                quantityChange: -qty,
                unitPrice: uPrice,
                totalPrice: tPrice,
                referenceId: `فاتورة #${String(item.sale_id).substring(0, 8)}`,
                partyName: custName,
                note: 'عملية بيع'
              });
            }
          }
        }
      } catch (err) {
        console.warn('Dexie read failed:', err);
      }

      // 3. Fetch Purchase items from Supabase
      try {
        const { data: purchaseItems, error: purchaseErr } = await supabase
          .from('purchase_items')
          .select(`
            id,
            quantity,
            unit_price,
            total_price,
            created_at,
            purchase_id,
            purchases (
              id,
              created_at,
              supplier_id,
              suppliers (
                name
              )
            )
          `)
          .eq('product_id', product.id);

        if (purchaseErr) {
          console.warn('Error fetching purchase items:', purchaseErr);
        } else if (purchaseItems) {
          purchaseItems.forEach((item: any) => {
            const dateStr = item.purchases?.created_at || item.created_at || new Date().toISOString();
            const qty = Math.abs(Number(item.quantity || 0));
            const uPrice = Number(item.unit_price || 0);
            const tPrice = Number(item.total_price || qty * uPrice);

            allEvents.push({
              id: `purchase-${item.id}`,
              type: 'purchase',
              date: dateStr,
              quantityChange: qty,
              unitPrice: uPrice,
              totalPrice: tPrice,
              referenceId: item.purchase_id ? `توريد #${String(item.purchase_id).substring(0, 8)}` : 'شراء',
              partyName: item.purchases?.suppliers?.name || 'مورد عام',
              note: 'توريد مشتريات'
            });
          });
        }
      } catch (err) {
        console.warn('Error fetching purchases:', err);
      }

      // 4. Fetch Inventory movements (adjustments, splits)
      try {
        const { data: invMovements } = await supabase
          .from('inventory_movements')
          .select('*')
          .eq('product_id', product.id);

        if (invMovements) {
          invMovements.forEach((item: any) => {
            const qty = Number(item.quantity || 0);
            let eventType: MovementEvent['type'] = 'adjustment';
            let change = qty;

            if (item.type === 'split_out') {
              eventType = 'split_out';
              change = -Math.abs(qty);
            } else if (item.type === 'split_in') {
              eventType = 'split_in';
              change = Math.abs(qty);
            }

            allEvents.push({
              id: `inv-${item.id}`,
              type: eventType,
              date: item.created_at || new Date().toISOString(),
              quantityChange: change,
              referenceId: item.type === 'split_out' || item.type === 'split_in' ? 'فك وتجزئة' : 'تسوية جرد',
              note: item.reference_note || 'تسوية مخزنية'
            });
          });
        }
      } catch (err) {
        console.warn('Error fetching inventory movements:', err);
      }

      // Sort chronologically descending (newest first)
      allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setMovements(allEvents);
    } catch (err) {
      console.error('Failed to load product movements:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter movements by Date Range
  const dateFilteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (!m.date) return true;
      const eventDate = m.date.split('T')[0];
      if (startDate && eventDate < startDate) return false;
      if (endDate && eventDate > endDate) return false;
      return true;
    });
  }, [movements, startDate, endDate]);

  // Analytics for the selected Date Range
  const analysis = useMemo(() => {
    if (!product) return null;

    // Sales in selected period
    const periodSales = dateFilteredMovements.filter(m => m.type === 'sale');
    const periodSoldQty = periodSales.reduce((sum, m) => sum + Math.abs(m.quantityChange), 0);
    const periodSalesRevenue = periodSales.reduce((sum, m) => sum + (m.totalPrice || 0), 0);

    // Purchases in selected period
    const periodPurchases = dateFilteredMovements.filter(m => m.type === 'purchase');
    const periodPurchasedQty = periodPurchases.reduce((sum, m) => sum + Math.abs(m.quantityChange), 0);
    const periodPurchasesCost = periodPurchases.reduce((sum, m) => sum + (m.totalPrice || 0), 0);

    // Overall Last Sale Date (from all movements)
    const allSales = movements.filter(m => m.type === 'sale');
    const now = Date.now();
    let lastSaleDate: string | null = null;
    let daysSinceLastSale: number | null = null;

    if (allSales.length > 0) {
      lastSaleDate = allSales[0].date;
      const diffMs = now - new Date(lastSaleDate).getTime();
      daysSinceLastSale = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    const currentStock = Number(product.stock_quantity || 0);
    const purchaseCost = Number(product.purchase_price || 0);
    const stockCapital = currentStock > 0 ? currentStock * purchaseCost : 0;

    // Stagnancy / Movement Classification
    let status: 'fast' | 'moderate' | 'slow' | 'stagnant' | 'out_of_stock' = 'moderate';
    let statusLabel = 'حركة معتدلة';
    let statusColor = 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900';
    let statusIcon = Clock;

    if (currentStock <= 0) {
      status = 'out_of_stock';
      statusLabel = 'منتهي من المخزون';
      statusColor = 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900';
      statusIcon = AlertTriangle;
    } else if (daysSinceLastSale !== null && daysSinceLastSale <= 14 && periodSoldQty > 0) {
      status = 'fast';
      statusLabel = 'سريع الحركة 🔥';
      statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
      statusIcon = Flame;
    } else if (daysSinceLastSale !== null && daysSinceLastSale <= 45) {
      status = 'moderate';
      statusLabel = 'حركة معتدلة ⚡';
      statusColor = 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900';
      statusIcon = TrendingUp;
    } else if (daysSinceLastSale !== null && daysSinceLastSale <= 90) {
      status = 'slow';
      statusLabel = 'بطيء الحركة ⏳';
      statusColor = 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900';
      statusIcon = Clock;
    } else {
      status = 'stagnant';
      statusLabel = 'صنف راكد 🛑';
      statusColor = 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900';
      statusIcon = AlertTriangle;
    }

    return {
      periodSoldQty,
      periodSalesRevenue,
      periodPurchasedQty,
      periodPurchasesCost,
      lastSaleDate,
      daysSinceLastSale,
      stockCapital,
      status,
      statusLabel,
      statusColor,
      statusIcon
    };
  }, [movements, dateFilteredMovements, product]);

  // Tab Filtering
  const displayedMovements = useMemo(() => {
    if (activeTab === 'all') return dateFilteredMovements;
    if (activeTab === 'sales') return dateFilteredMovements.filter(m => m.type === 'sale');
    if (activeTab === 'purchases') return dateFilteredMovements.filter(m => m.type === 'purchase');
    if (activeTab === 'adjustments') return dateFilteredMovements.filter(m => m.type === 'adjustment' || m.type === 'split_in' || m.type === 'split_out');
    return dateFilteredMovements;
  }, [dateFilteredMovements, activeTab]);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-gray-900 dark:text-white">
                  {product.name}
                </h2>
                {analysis && (
                  <span className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-bold border flex items-center gap-1",
                    analysis.statusColor
                  )}>
                    <analysis.statusIcon className="w-3.5 h-3.5" />
                    <span>{analysis.statusLabel}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                سجل حركة ومجريات الصنف (المبيعات والتوريد والتسويات)
                {product.unit ? ` • الوحدة: ${product.unit}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors"
              title="طباعة كشف الحركة"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-gray-50 dark:bg-gray-800/80 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-emerald-600" />
              فترة المتابعة:
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'month', label: 'آخر شهر (30 يوم)' },
                { id: '7days', label: 'آخر 7 أيام' },
                { id: '3months', label: 'آخر 3 أشهر' },
                { id: 'all', label: 'الكل (كامل السجل)' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDateRangePreset(t.id as any)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                    preset === t.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 border border-gray-200 dark:border-gray-700"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-gray-400">من:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-400">إلى:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('custom');
                }}
                className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-800 dark:text-gray-200 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* KPI Analytics Cards */}
          {analysis && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Card 1: Total Sales Revenue (Main) and Quantity (Sub) */}
              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/50">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-1.5">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  إجمالي المبيعات (خلال الفترة)
                </span>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight">
                  {analysis.periodSalesRevenue.toLocaleString()} {settings.currency}
                </div>
                <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <span>الكمية المباعة:</span>
                  <span className="font-black underline">{analysis.periodSoldQty.toLocaleString()} {product.unit || 'قطعة'}</span>
                </div>
              </div>

              {/* Card 2: Total Purchases Cost (Main) and Quantity (Sub) */}
              <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5 mb-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  إجمالي التوريد (خلال الفترة)
                </span>
                <div className="text-2xl font-black text-blue-700 dark:text-blue-300 tracking-tight">
                  {analysis.periodPurchasesCost.toLocaleString()} {settings.currency}
                </div>
                <div className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1">
                  <span>الكمية الموردة:</span>
                  <span className="font-black underline">{analysis.periodPurchasedQty.toLocaleString()} {product.unit || 'قطعة'}</span>
                </div>
              </div>

              {/* Card 3: Stock Quantity & Capital */}
              <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-1.5">
                  <Package className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  الرصيد المتوفر بالمخزن
                </span>
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {Number(product.stock_quantity || 0).toLocaleString()}
                  <span className="text-xs font-normal text-gray-500 mr-1.5">{product.unit || 'قطعة'}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  قيمة المخزون: {analysis.stockCapital.toLocaleString()} {settings.currency}
                </div>
              </div>

              {/* Card 4: Last Sale & Velocity */}
              <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-4 h-4 text-amber-500" />
                  آخر حركة بيع
                </span>
                <div className="text-lg font-black text-gray-900 dark:text-white">
                  {analysis.daysSinceLastSale !== null 
                    ? `منذ ${analysis.daysSinceLastSale} يوم`
                    : 'لم يُسجل بيع'}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {analysis.lastSaleDate 
                    ? new Date(analysis.lastSaleDate).toLocaleDateString('ar-SA')
                    : 'لا توجد مبيعات سابقة'}
                </div>
              </div>
            </div>
          )}

          {/* Stagnancy Advisory Alert if stagnant */}
          {analysis && analysis.status === 'stagnant' && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-3 text-red-800 dark:text-red-300 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تنبيه: هذا الصنف يعتبر راكداً حالياً في المخزن</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  رأس المال المجمد فيه هو {analysis.stockCapital.toLocaleString()} {settings.currency}. يُنصح بعمل تخفيض أو عرض ترويجي لتسريع تصريفه.
                </p>
              </div>
            </div>
          )}

          {/* Movement Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {[
                { id: 'all', label: `كافة الحركات (${displayedMovements.length})` },
                { id: 'sales', label: `المبيعات (${dateFilteredMovements.filter(m => m.type === 'sale').length})` },
                { id: 'purchases', label: `التوريد والمشتريات (${dateFilteredMovements.filter(m => m.type === 'purchase').length})` },
                { id: 'adjustments', label: `التسويات والفك (${dateFilteredMovements.filter(m => m.type === 'adjustment' || m.type === 'split_in' || m.type === 'split_out').length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "pb-3 px-2 text-xs sm:text-sm font-bold border-b-2 transition-all",
                    activeTab === tab.id
                      ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Movement Ledger Table */}
          <div className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-right text-xs sm:text-sm">
              <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-gray-500 dark:text-gray-400 font-bold border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="p-3.5">النوع والبيان</th>
                  <th className="p-3.5">التاريخ</th>
                  <th className="p-3.5 text-center">الكمية</th>
                  <th className="p-3.5 text-center">السعر</th>
                  <th className="p-3.5 text-center">الإجمالي</th>
                  <th className="p-3.5">الطرف / العميل / المورد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                      <span>جارِ تحميل سجل حركات الصنف...</span>
                    </td>
                  </tr>
                ) : displayedMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400">
                      لا توجد حركات مسجلة لهذا الصنف خلال الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  displayedMovements.map(item => {
                    const isSale = item.type === 'sale';
                    const isPurchase = item.type === 'purchase';
                    const isSplit = item.type === 'split_in' || item.type === 'split_out';

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                              isSale ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" :
                              isPurchase ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" :
                              "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                            )}>
                              {isSale ? 'بيع' : isPurchase ? 'شراء' : isSplit ? 'فك' : 'جرد'}
                            </span>
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">
                                {item.referenceId || item.note}
                              </div>
                              <span className="text-[11px] text-gray-400">{item.note}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {new Date(item.date).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="p-3.5 text-center font-bold">
                          <span className={cn(
                            "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-black",
                            item.quantityChange > 0 
                              ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30" 
                              : "text-red-700 bg-red-50 dark:bg-red-950/30"
                          )}>
                            {item.quantityChange > 0 ? `+${item.quantityChange}` : item.quantityChange}
                            <span className="font-normal text-[10px] mr-0.5">{product.unit || 'قطعة'}</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                          {item.unitPrice ? `${item.unitPrice.toLocaleString()} ${settings.currency}` : '-'}
                        </td>
                        <td className="p-3.5 text-center text-xs font-bold text-gray-900 dark:text-white">
                          {item.totalPrice ? `${item.totalPrice.toLocaleString()} ${settings.currency}` : '-'}
                        </td>
                        <td className="p-3.5 text-xs text-gray-700 dark:text-gray-300 font-medium">
                          {item.partyName || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex justify-between items-center shrink-0">
          <span className="text-xs text-gray-500">
            إجمالي الحركات المعروضة: {displayedMovements.length} عملية
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
