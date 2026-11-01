import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, User, 
  CreditCard, Receipt, History, CheckCircle2, X, Wallet, Building,
  MessageCircle, Smartphone, Banknote, Loader2, AlertCircle, UserPlus, Calendar, Download,
  Maximize, Camera, Printer, Lock, Edit2
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { cn } from '../utils';
import { useSettings } from '../contexts/SettingsContext';
import { generateInvoicePDF, printInvoice } from '../utils/pdfGenerator';
import { useSubscription } from '../components/SubscriptionGuard';

type Product = {
  id: string;
  name: string;
  barcode?: string;
  sell_price: number;
  purchase_price?: number;
  stock_quantity: number;
  unit?: string;
  image_url: string;
  images?: string[];
};

type Customer = {
  id: string;
  name: string;
  phone: string;
};

type CartItem = {
  product: Product;
  quantity: number | string;
  unit_price: number | string;
};

type SaleRecord = {
  id: string;
  total_amount: number;
  paid_amount: number;
  payment_method: string;
  created_at: string;
  customers?: { name: string; phone?: string };
  is_custom_order?: boolean;
  status?: string;
  sale_items?: {
    product_id: string;
    quantity: number;
    unit_price: number;
    products?: {
      name: string;
      unit?: string;
    }
  }[];
  items?: {
    product_name: string;
    quantity?: number;
    unit_price?: number;
    unit?: string;
  }[];
};

import { playBeep } from '../utils/audio';
import { useQueryClient } from '@tanstack/react-query';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { usePaymentMethods } from '../hooks/usePaymentMethods';

export function Sales() {
  const queryClient = useQueryClient();
  const { data: paymentMethodsList = [] } = usePaymentMethods();
  const { settings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('admin');
  const [historyLimit, setHistoryLimit] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data);
      }
    });
  }, []);
  
  // Mobile Cart Modal
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Checkout State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [discount, setDiscount] = useState<number | string>('');
  const [amountPaid, setAmountPaid] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [saleDate, setSaleDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Quick Add Customer State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Sale Details Modal
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [isSaleDetailsOpen, setIsSaleDetailsOpen] = useState(false);

  // Edit Sale Logic
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  // Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const barcodeBuffer = useRef<string>('');
  const lastScanTime = useRef<number>(0);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // --- Cart Logic ---
  const addToCart = React.useCallback((product: Product) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (Number(existing.quantity || 0) >= product.stock_quantity) return prev;
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: Number(item.quantity || 0) + 1 } 
            : item
        );
      }
      return [...prev, { product, quantity: 1, unit_price: product.sell_price }];
    });
  }, [isExpired, setShowRenewModal]);
  
  // Use refs to access latest state in scanner callbacks without recreating the scanner
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    fetchData(historyLimit > 50);
  }, [historyLimit]);

  // External Barcode Scanner Support (Keyboard Emulation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field (unless it's the barcode input specifically, but here we use global listener)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Only listen in POS tab
      if (activeTab !== 'pos') return;

      const now = Date.now();
      // If time between keystrokes is too long, it's likely manual typing, reset buffer
      if (now - lastScanTime.current > 50) {
        barcodeBuffer.current = '';
      }
      lastScanTime.current = now;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length > 3) {
          handleBarcodeScanned(barcodeBuffer.current);
          barcodeBuffer.current = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Camera Scanner Initialization
  useEffect(() => {
    const startScanner = async () => {
      if (isScannerOpen) {
        try {
          const html5QrCode = new Html5Qrcode("barcode-reader");
          html5QrCodeRef.current = html5QrCode;
          
          const config = { 
            fps: 30, // Increased FPS for faster scanning
            qrbox: { width: 300, height: 150 },
            aspectRatio: 1.0,
            disableFlip: false
          };
          
          await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText) => {
              handleBarcodeScanned(decodedText);
              stopScanner();
            },
            undefined
          );
        } catch (err) {
          console.error("Failed to start scanner:", err);
        }
      }
    };

    const stopScanner = async () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current = null;
          setIsScannerOpen(false);
        } catch (err) {
          console.error("Failed to stop scanner:", err);
        }
      } else {
        setIsScannerOpen(false);
      }
    };

    if (isScannerOpen) {
      startScanner();
    }

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [isScannerOpen]);

  const handleBarcodeScanned = (code: string) => {
    const product = productsRef.current.find(p => p.barcode === code);
    if (product) {
      playBeep();
      addToCart(product);
    } else {
      // toast.error(`المنتج ذو الباركود ${code} غير موجود`);
    }
  };

  const fetchData = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    // Don't set isLoading(true) here if not load more, to stay optimistic, 
    // but to prevent jumping, let's keep it as is, we will set it false immediately.
    else setIsLoading(products.length === 0); 
    
    try {
      let userId = localStorage.getItem('target_tenant_id');
      if (!userId) {
        try {
          const { data: tenantRpcId } = await supabase.rpc('get_current_tenant_id');
          if (tenantRpcId) {
            userId = tenantRpcId;
            localStorage.setItem('target_tenant_id', tenantRpcId);
          }
        } catch (e) {
          console.warn('Sales get_current_tenant_id failed:', e);
        }
      }

      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
          localStorage.setItem('target_tenant_id', user.id);
        }
      }

      if (!userId) {
        if (isLoadMore) setIsLoadingMore(false);
        else setIsLoading(false);
        return;
      }

      // 1. Load from Local DB (IndexedDB) instantly
      try {
        const localProducts = await db.products.toArray();
        const availableProducts = localProducts.filter(p => p.stock_quantity > 0 && p.tenant_id === userId);
        
        if (availableProducts.length > 0) {
          const mappedProducts = availableProducts.map(p => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            sell_price: p.sell_price,
            stock_quantity: p.stock_quantity,
            unit: p.unit || 'قطعة',
            image_url: p.image_url,
            images: p.images || (p.image_url ? [p.image_url] : [])
          })) as Product[];
          setProducts(mappedProducts);
        }

        const localCustomers = await db.customers.toArray();
        const filteredCustomers = localCustomers.filter(c => c.tenant_id === userId).sort((a, b) => a.name.localeCompare(b.name));
        if (filteredCustomers.length > 0) {
          setCustomers(filteredCustomers as Customer[]);
        }

        const localSales = await db.sales.orderBy('created_at').reverse().toArray();
        const filteredSales = localSales.filter(s => s.tenant_id === userId).slice(0, historyLimit);
        if (filteredSales.length > 0) {
          const mappedHistory = await Promise.all(filteredSales.map(async (sale) => {
             let customerName = 'عميل غير معروف';
             if (sale.customer_id) {
               const c = await db.customers.get(sale.customer_id);
               if (c && c.tenant_id === userId) customerName = c.name;
             }
             
             const items = await db.sale_items.where({ sale_id: sale.id }).toArray();
             const mappedItems = await Promise.all(items.map(async (item) => {
                let productName = 'منتج غير معروف';
                let unit = 'قطعة';
                const p = await db.products.get(item.product_id);
                if (p) {
                  productName = p.name;
                  unit = p.unit || 'قطعة';
                }
                return {
                  product_name: productName,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  unit: unit
                };
             }));

             return {
               ...sale,
               customers: { name: customerName },
               items: mappedItems
             };
          }));
          setSalesHistory(mappedHistory as SaleRecord[]);
        }
      } catch (localErr) {
        console.error("Error reading from local DB:", localErr);
      }

      // Stop blocking the UI after local DB read (instant!)
      if (!isLoadMore) setIsLoading(false);

      // 2. If offline, stop here
      if (!navigator.onLine) {
        return;
      }

      // 3. Background Sync from Supabase
      const [productsRes, customersRes, salesRes, customOrdersRes] = await Promise.all([
        supabase.from('products').select('id, name, barcode, sell_price, purchase_price, stock_quantity, unit, image_url, images').eq('tenant_id', userId).gt('stock_quantity', 0).order('created_at', { ascending: false }),
        supabase.from('customers').select('*').eq('tenant_id', userId).order('name', { ascending: true }),
        supabase.from('sales').select('*, customers(name), sale_items(id, product_id, quantity, unit_price, products(name, unit))').eq('tenant_id', userId).order('created_at', { ascending: false }).limit(historyLimit),
        supabase.from('custom_orders').select('*, customers(name), custom_order_items(products(name))').eq('tenant_id', userId).order('created_at', { ascending: false }).limit(historyLimit)
      ]);
      
      if (productsRes.data) {
        setProducts(productsRes.data);
        db.products.bulkPut(productsRes.data.map(p => ({ ...p, tenant_id: userId } as any))).catch(err => console.error("Error caching products:", err));
      }
      if (customersRes.data) {
        setCustomers(customersRes.data);
        db.customers.bulkPut(customersRes.data.map(c => ({ ...c, tenant_id: userId } as any))).catch(err => console.error("Error caching customers:", err));
      }
      
      let combinedHistory: SaleRecord[] = [];
      
      if (salesRes.data) {
        const mappedSales = salesRes.data.map(sale => ({
          ...sale,
          items: sale.sale_items?.map((item: any) => ({
            product_name: item.products?.name || 'منتج غير معروف',
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit: item.products?.unit || 'قطعة'
          }))
        }));
        combinedHistory = [...combinedHistory, ...mappedSales];
      }
      
      if (customOrdersRes.data) {
        const mappedCustomOrders = customOrdersRes.data.map(co => ({
          id: co.id,
          total_amount: co.total_price,
          paid_amount: co.advance_payment,
          payment_method: 'دفعة مقدمة',
          created_at: co.created_at,
          customers: co.customers,
          is_custom_order: true,
          status: co.status,
          items: co.custom_order_items?.map((item: any) => ({
            product_name: item.products?.name || 'قماش غير معروف'
          }))
        }));
        combinedHistory = [...combinedHistory, ...mappedCustomOrders];
      }
      
      // Sort combined history by created_at descending
      combinedHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setSalesHistory(combinedHistory);

      // Update local DB with fresh sales
      if (salesRes.data) {
        // We only save the actual sales to the local DB, not the custom orders for now
        // to keep the schema simple.
        const salesToSave = salesRes.data.map(sale => {
          const { customers, sale_items, ...rest } = sale;
          return rest;
        });
        await db.sales.bulkPut(salesToSave);

        // Save sale items
        const itemsToSave: any[] = [];
        salesRes.data.forEach(sale => {
          if (sale.sale_items) {
            sale.sale_items.forEach((item: any) => {
              itemsToSave.push({
                id: item.id || crypto.randomUUID(), // Use real ID if available
                sale_id: sale.id,
                product_id: item.product_id || '',
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.quantity * item.unit_price
              });
            });
          }
        });
        await db.sale_items.bulkPut(itemsToSave);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        const isFractional = ['كجم', 'جرام', 'متر', 'سم', 'لتر', 'مل'].includes(item.product.unit || '');
        const step = isFractional ? 0.5 : 1;
        const actualDelta = delta > 0 ? step : -step;
        const newQty = Math.max(isFractional ? 0.1 : 1, Number((Number(item.quantity || 0) + actualDelta).toFixed(2)));
        
        if (newQty > 0 && newQty <= item.product.stock_quantity) {
          return { ...item, quantity: newQty };
        }
      }
      return item;
    }).filter(item => Number(item.quantity || 0) > 0));
  };

  const setExactQuantity = (productId: string, qty: number | string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        if (typeof qty === 'string' && qty === '') {
           return { ...item, quantity: '' };
        }
        const numericQty = Number(qty);
        if (!isNaN(numericQty) && numericQty > 0 && numericQty <= item.product.stock_quantity) {
          return { ...item, quantity: qty };
        } else if (numericQty <= 0) {
          return { ...item, quantity: 0 }; // Will be filtered out
        }
      }
      return item;
    }).filter(item => item.quantity !== 0));
  };

  const updatePrice = (productId: string, newPrice: number | string) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { ...item, unit_price: newPrice };
      }
      return item;
    }));
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 0)), 0);
  const cartTotal = Math.max(0, cartSubtotal - (Number(discount) || 0));
  const debtAmount = cartTotal - (Number(amountPaid) || 0);

  // --- Quick Add Customer ---
  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!newCustomer.name || !newCustomer.phone) return;
    setIsAddingCustomer(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const tenantId = tenantIdData || sessionData.session?.user.id;
      const { data, error } = await supabase.from('customers').insert([{
        tenant_id: tenantId,
        name: newCustomer.name,
        phone: newCustomer.phone
      }]).select().single();

      if (error) throw error;

      setCustomers(prev => [...prev, data]);
      setSelectedCustomer(data.id);
      setIsQuickAddOpen(false);
      setNewCustomer({ name: '', phone: '' });
    } catch (error: any) {
      console.error('Error adding customer:', error);
      toast.error('حدث خطأ أثناء إضافة العميل. تأكد من تحديث قاعدة البيانات.');
    } finally {
      setIsAddingCustomer(false);
    }
  };

  const openEditSaleMode = async (sale: SaleRecord) => {
    setIsLoading(true);
    try {
      const { data: fullSale, error } = await supabase
        .from('sales')
        .select(`*, sale_items(*, products(*))`)
        .eq('id', sale.id)
        .single();
        
      if (error) throw error;
      
      const restoredCart: CartItem[] = fullSale.sale_items.map((item: any) => ({
        product: item.products,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));
      
      setCart(restoredCart);
      setSelectedCustomer(fullSale.customer_id || '');
      setDiscount(fullSale.discount || 0);
      setAmountPaid(fullSale.paid_amount || 0);
      setPaymentMethod(fullSale.payment_method || 'cash');
      setSaleDate(new Date(fullSale.created_at).toISOString().split('T')[0]);
      
      setEditingSaleId(fullSale.id);
      setIsSaleDetailsOpen(false);
      setActiveTab('pos');
    } catch (err) {
      console.error(err);
      toast.error('فشل جلب تفاصيل الفاتورة للتعديل');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Delete Sale Logic ---
  const handleDeleteSale = async (saleId: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟ سيتم استرجاع المخزون وتحديث رصيد العميل وحذف المعاملة المالية.')) return;
    
    try {
      // 1. Get sale details
      const { data: sale, error: fetchError } = await supabase
        .from('sales')
        .select('*, sale_items(product_id, quantity)')
        .eq('id', saleId)
        .single();
        
      if (fetchError) throw fetchError;

      // 2. Restore stock
      if (sale.sale_items && sale.sale_items.length > 0) {
        for (const item of sale.sale_items) {
          const { data: product } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
          if (product) {
            await supabase.from('products').update({ stock_quantity: product.stock_quantity + item.quantity }).eq('id', item.product_id);
          }
        }
      }

      // 3. Revert customer balance
      if (sale.customer_id) {
        const debt = sale.total_amount - sale.paid_amount;
        if (debt > 0) {
          const { data: customer } = await supabase.from('customers').select('balance').eq('id', sale.customer_id).single();
          if (customer) {
            await supabase.from('customers').update({ balance: customer.balance - debt }).eq('id', sale.customer_id);
          }
        }
      }

      // 4. Delete transaction
      await supabase.from('transactions').delete().eq('reference_type', 'sale').eq('reference_id', saleId);

      // 5. Delete sale items (should be cascade, but let's be safe)
      await supabase.from('sale_items').delete().eq('sale_id', saleId);

      // 6. Delete sale
      await supabase.from('sales').delete().eq('id', saleId);

      setIsSaleDetailsOpen(false);
      fetchData();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('تم حذف الفاتورة بنجاح');
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      toast.error('حدث خطأ أثناء حذف الفاتورة: ' + (error.message || JSON.stringify(error)));
    }
  };

  // --- Checkout Logic ---
  const handleCheckout = () => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (cart.length === 0 || isProcessing) return;
    
    // 1. Prepare Receipt
    const customerInfo = customers.find(c => c.id === selectedCustomer);
    setLastReceipt({
      items: [...cart],
      subtotal: cartSubtotal,
      discount,
      total: cartTotal,
      paid: Number(amountPaid) || 0,
      debt: debtAmount,
      customer: customerInfo,
      method: paymentMethod
    });

    // 2. Clear out cart immediately to give instant feedback
    const savedCart = [...cart];
    const savedAmountPaid = amountPaid;
    const savedDiscount = discount;
    const savedCustomer = selectedCustomer;
    const savedDate = saleDate;
    const savedEditingId = editingSaleId;
    const savedTotal = cartTotal;
    const savedSubtotal = cartSubtotal;
    const savedMethod = paymentMethod;
    const savedDebt = debtAmount;

    setCart([]);
    setDiscount(0);
    setAmountPaid('');
    setSelectedCustomer('');
    setSaleDate(new Date().toISOString().split('T')[0]);
    setEditingSaleId(null);
    setCheckoutSuccess(true);
    setIsProcessing(false);

    // 3. Keep original code running in background
    const checkoutPromise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      if (savedEditingId) {
        if (!navigator.onLine) {
          throw new Error('لا يمكن تعديل المبيعات في وضع عدم الاتصال');
        }
        const saleItemsPayload = savedCart.map(item => ({
          product_id: item.product.id,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total_price: (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
        }));
        const { error: rpcError } = await supabase.rpc('update_sale_invoice_v3', {
          p_sale_id: savedEditingId,
          p_tenant_id: userId,
          p_customer_id: savedCustomer || null,
          p_total_amount: Number(savedTotal) || 0,
          p_discount: Number(savedDiscount) || 0,
          p_paid_amount: Number(savedAmountPaid) || 0,
          p_payment_method: savedMethod,
          p_items: saleItemsPayload
        });
        if (rpcError) throw rpcError;
      } else {
        const isToday = savedDate === new Date().toISOString().split('T')[0];
        const createdAt = isToday ? new Date().toISOString() : new Date(savedDate).toISOString();
        let salePayload: any = {
          tenant_id: userId,
          customer_id: savedCustomer || null,
          subtotal: Number(savedSubtotal) || 0,
          discount: Number(savedDiscount) || 0,
          total_amount: Number(savedTotal) || 0,
          paid_amount: Number(savedAmountPaid) || 0,
          payment_method: savedMethod,
          status: savedDebt > 0 ? 'pending' : 'completed',
          created_by: userId,
          created_at: createdAt
        };
        const saleItems = savedCart.map(item => ({
          product_id: item.product.id,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total_price: (Number(item.unit_price) || 0) * (Number(item.quantity) || 0)
        }));

        if (!navigator.onLine) {
          const localSaleId = crypto.randomUUID();
          await db.pending_sales.add({
            id: localSaleId,
            ...salePayload,
            items: saleItems
          });
          for (const item of savedCart) {
            const product = await db.products.get(item.product.id);
            if (product) {
              await db.products.update(item.product.id, { stock_quantity: product.stock_quantity - Number(item.quantity || 0) });
            }
          }
          if (savedDebt > 0 && savedCustomer) {
            const customer = await db.customers.get(savedCustomer);
            if (customer) {
              await db.customers.update(savedCustomer, { balance: Number(customer.balance || 0) + savedDebt });
            }
          }
          return; // done offline
        }

        // Online mode
        let { data: saleData, error: saleError } = await supabase.from('sales').insert([salePayload]).select().single();
        if (saleError && saleError.message?.includes('foreign key constraint')) {
          delete salePayload.created_by;
          const retry = await supabase.from('sales').insert([salePayload]).select().single();
          saleData = retry.data;
          saleError = retry.error;
        }
        if (saleError) throw new Error('فشل في إنشاء الفاتورة: ' + saleError.message);

        const onlineSaleItems = saleItems.map(item => ({
          ...item,
          sale_id: saleData.id,
          tenant_id: userId
        }));
        const { error: itemsError } = await supabase.from('sale_items').insert(onlineSaleItems);
        if (itemsError) {
          await supabase.from('sales').delete().eq('id', saleData.id);
          throw new Error('فشل في حفظ المنتجات المباعة: ' + itemsError.message);
        }

        for (const item of savedCart) {
          const newStock = item.product.stock_quantity - Number(item.quantity || 0);
          await supabase.from('products').update({ stock_quantity: newStock }).eq('id', item.product.id);
        }
      }
    })();

    toast.promise(checkoutPromise, {
      loading: 'جاري إنشاء الفاتورة...',
      success: () => {
        fetchData(); // refresh products in background
        queryClient.invalidateQueries({ queryKey: ['products'] });
        return 'تمت العملية بنجاح';
      },
      error: (err) => 'حدث خطأ: ' + err.message
    });
  };

  const sendWhatsAppReceipt = () => {
    if (!lastReceipt || !lastReceipt.customer?.phone) return;
    
    let message = `مرحباً ${lastReceipt.customer.name}،\n`;
    if (settings.receiptHeader) {
      message += `${settings.receiptHeader}\n\n`;
    }
    message += `شكراً لتسوقك معنا!\n\n`;
    message += `*تفاصيل الفاتورة:*\n`;
    lastReceipt.items.forEach((item: CartItem) => {
      message += `- ${item.product.name} (${item.quantity} ${item.product.unit || 'قطعة'}): ${Number(item.unit_price || 0) * Number(item.quantity || 0)} ${settings.currency}\n`;
    });
    message += `\n`;
    if (lastReceipt.discount > 0) {
      message += `الخصم: ${lastReceipt.discount} ${settings.currency}\n`;
    }
    message += `*الإجمالي: ${lastReceipt.total} ${settings.currency}*\n`;
    message += `المدفوع: ${lastReceipt.paid} ${settings.currency}\n`;
    if (lastReceipt.debt > 0) {
      message += `*المتبقي (دين): ${lastReceipt.debt} ${settings.currency}*\n`;
    }
    
    if (settings.receiptFooter) {
      message += `\n${settings.receiptFooter}`;
    } else {
      message += `\nنسعد بزيارتك القادمة!`;
    }
    
    if (settings.storeAddress || settings.storePhone) {
      message += `\n`;
      if (settings.storeAddress) message += `\nالعنوان: ${settings.storeAddress}`;
      if (settings.storePhone) message += `\nهاتف: ${settings.storePhone}`;
    }

    const encodedMessage = encodeURIComponent(message);
    const phone = lastReceipt.customer.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const handlePrintLastReceipt = async () => {
    try {
      if (!lastReceipt) return;
      const invoiceData = {
        title: 'فاتورة مبيعات',
        invoiceNumber: new Date().getTime().toString().slice(-6),
        date: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        customerName: lastReceipt.customer?.name || 'عميل عام',
        customerPhone: lastReceipt.customer?.phone || '',
        items: lastReceipt.items?.map((item: any) => ({
          description: item.product?.name,
          quantity: `${item.quantity} ${item.product?.unit || 'قطعة'}`,
          price: `${item.unit_price.toLocaleString()} ${settings.currency}`,
          total: `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}`
        })) || [],
        summary: [
          ...(lastReceipt.discount > 0 ? [{ label: 'المجموع الفرعي', value: `${lastReceipt.subtotal.toLocaleString()} ${settings.currency}`}, { label: 'الخصم', value: `${lastReceipt.discount.toLocaleString()} ${settings.currency}` }] : []),
          { label: 'الإجمالي', value: `${lastReceipt.total.toLocaleString()} ${settings.currency}`, isBold: true },
          { label: 'المدفوع', value: `${lastReceipt.paid.toLocaleString()} ${settings.currency}` },
          ...(lastReceipt.debt > 0 ? [{ label: 'المتبقي (الديون)', value: `${lastReceipt.debt.toLocaleString()} ${settings.currency}`, isBold: true, isGrandTotal: true }] : [])
        ]
      };
      await printInvoice(settings, invoiceData);
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء الطباعة');
    }
  };

  const handleDownloadLastReceipt = async () => {
    try {
      if (!lastReceipt) return;
      const invoiceData = {
        title: 'فاتورة مبيعات',
        invoiceNumber: new Date().getTime().toString().slice(-6),
        date: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        customerName: lastReceipt.customer?.name || 'عميل عام',
        customerPhone: lastReceipt.customer?.phone || '',
        items: lastReceipt.items?.map((item: any) => ({
          description: item.product?.name,
          quantity: `${item.quantity} ${item.product?.unit || 'قطعة'}`,
          price: `${item.unit_price.toLocaleString()} ${settings.currency}`,
          total: `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}`
        })) || [],
        summary: [
          ...(lastReceipt.discount > 0 ? [{ label: 'المجموع الفرعي', value: `${lastReceipt.subtotal.toLocaleString()} ${settings.currency}`}, { label: 'الخصم', value: `${lastReceipt.discount.toLocaleString()} ${settings.currency}` }] : []),
          { label: 'الإجمالي', value: `${lastReceipt.total.toLocaleString()} ${settings.currency}`, isBold: true },
          { label: 'المدفوع', value: `${lastReceipt.paid.toLocaleString()} ${settings.currency}` },
          ...(lastReceipt.debt > 0 ? [{ label: 'المتبقي (الديون)', value: `${lastReceipt.debt.toLocaleString()} ${settings.currency}`, isBold: true, isGrandTotal: true }] : [])
        ]
      };
      await generateInvoicePDF(settings, invoiceData, `فاتورة_${new Date().getTime()}`);
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء تحميل الفاتورة');
    }
  };

  // --- Render Helpers ---
  const renderCartContent = (onClose?: () => void) => (
    <div className="flex flex-col h-full relative">
      <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-brand-primary" />
          سلة المشتريات
        </h2>
        <div className="flex items-center gap-2">
          <span className="bg-brand-primary/10 text-brand-primary px-2.5 py-1 rounded-lg text-sm font-bold">
            {cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} منتج
          </span>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
            <ShoppingCart className="w-12 h-12 opacity-20" />
            <p className="font-medium">السلة فارغة</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0">
                {item.product.images?.[0] || item.product.image_url ? (
                  <img src={item.product.images?.[0] || item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="w-6 h-6 text-gray-300" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{item.product.name}</h4>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price === 0 ? '' : item.unit_price}
                    onChange={(e) => updatePrice(item.product.id, e.target.value)}
                    className="w-24 px-2 py-1 text-sm font-bold text-brand-primary bg-brand-primary/5 border border-brand-primary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  />
                  <span className="text-xs text-gray-500">{settings.currency}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                  <button onClick={() => updateQuantity(item.product.id, -1)} className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 rounded shadow-sm text-gray-600 dark:text-gray-300 hover:text-brand-primary">
                    <Minus className="w-3 h-3" />
                  </button>
                  <input 
                    type="number" 
                    step="any"
                    value={item.quantity === 0 ? '' : item.quantity}
                    onChange={(e) => setExactQuantity(item.product.id, e.target.value)}
                    className="text-sm font-bold w-12 text-center bg-transparent border-none focus:ring-0 p-0"
                  />
                  <button onClick={() => updateQuantity(item.product.id, 1)} className="w-6 h-6 flex items-center justify-center bg-white dark:bg-gray-700 rounded shadow-sm text-gray-600 dark:text-gray-300 hover:text-brand-primary">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {item.product.unit && item.product.unit !== 'قطعة' && (
                  <span className="text-xs text-gray-500 font-medium">{item.product.unit}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-4">
        {/* Customer Selection with Quick Add */}
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">ربط بعميل (اختياري)</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchableSelect 
                options={[{value: '', label: '-- بدون عميل (نقدي) --'}, ...customers.filter((c: any) => c.is_active !== false && !c.is_archived).map(c => ({ value: c.id, label: c.name, subtitle: c.phone }))]}
                value={selectedCustomer}
                onChange={setSelectedCustomer}
                placeholder="ابحث عن عميل..."
              />
            </div>
            <button 
              onClick={() => setIsQuickAddOpen(true)}
              className="w-10 h-10 shrink-0 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-xl flex items-center justify-center transition-colors"
              title="إضافة عميل جديد سريعاً"
            >
              <UserPlus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
            <span>المجموع الفرعي</span>
            <span>{cartSubtotal.toLocaleString()} {settings.currency}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-800">
            <span>الإجمالي</span>
            <span className="text-brand-primary">{cartSubtotal.toLocaleString()} {settings.currency}</span>
          </div>
        </div>

        <button 
          onClick={() => {
            setAmountPaid(cartSubtotal); // Default to full payment
            setIsCheckoutOpen(true);
            setIsMobileCartOpen(false);
          }}
          disabled={cart.length === 0}
          className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          <CreditCard className="w-5 h-5" />
          <span>متابعة الدفع</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col max-w-[1600px] mx-auto" dir="rtl">
      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-lg">مسح الباركود</h3>
              <button 
                onClick={async () => {
                  if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                    html5QrCodeRef.current = null;
                  }
                  setIsScannerOpen(false);
                }} 
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <div id="barcode-reader" className="w-full overflow-hidden rounded-2xl"></div>
              <p className="text-center text-sm text-gray-500 mt-4">وجه الكاميرا نحو الباركود للمسح</p>
            </div>
          </div>
        </div>
      )}

      {/* Header Tabs */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">المبيعات</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 font-medium">نقطة البيع وإدارة الفواتير</p>
        </div>
        <div className="flex bg-white dark:bg-gray-900 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <button
            onClick={() => {
              if (editingSaleId && !confirm('هل أنت متأكد من إلغاء تعديل الفاتورة والخروج من وضع التعديل؟')) return;
              if (editingSaleId) {
                setEditingSaleId(null);
                setCart([]);
                setDiscount(0);
                setSelectedCustomer('');
                setAmountPaid('');
              }
              setActiveTab('pos');
            }}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
              activeTab === 'pos' 
                ? "bg-brand-dark text-white shadow-sm" 
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            )}
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">نقطة البيع</span>
          </button>
          <button
            onClick={() => {
              if (editingSaleId && !confirm('هل أنت متأكد من إلغاء تعديل الفاتورة والخروج من وضع التعديل؟')) return;
              if (editingSaleId) {
                setEditingSaleId(null);
                setCart([]);
                setDiscount(0);
                setSelectedCustomer('');
                setAmountPaid('');
              }
              setActiveTab('history');
            }}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all",
              activeTab === 'history' 
                ? "bg-brand-dark text-white shadow-sm" 
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            )}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">سجل المبيعات</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'pos' && (
        <div className="flex-1 flex flex-col min-h-0">
          {editingSaleId && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400 p-4 rounded-2xl mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Edit2 className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-lg">وضع التعديل مفعل</h3>
                  <p className="text-sm opacity-80">أنت الآن تقوم بتعديل الفاتورة رقم: {editingSaleId.substring(0, 8)}. قم بالتعديل في سلة المشتريات ثم اضغط إتمام الدفع لحفظ التغييرات.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingSaleId(null);
                  setCart([]);
                  setDiscount(0);
                  setSelectedCustomer('');
                  setAmountPaid('');
                }}
                className="bg-white/50 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 text-amber-900 dark:text-amber-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              >
                إلغاء التعديل
              </button>
            </div>
          )}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Right Side: Products Grid */}
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="ابحث عن منتج بالاسم..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-4 pr-12 py-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  />
                </div>
                <button 
                  onClick={() => setIsScannerOpen(true)}
                  className="bg-brand-primary text-white p-3.5 rounded-2xl hover:bg-brand-primary/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                  title="مسح باركود بالكاميرا"
                >
                  <Camera className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <Loader2 className="w-10 h-10 animate-spin mb-4 text-brand-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 lg:pb-0">
                  {filteredProducts.map(product => {
                    const cartItem = cart.find(item => item.product.id === product.id);
                    const isOutOfStock = product.stock_quantity <= 0;
                    
                    return (
                      <div 
                        key={product.id} 
                        onClick={() => !isOutOfStock && addToCart(product)}
                        className={cn(
                          "bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 flex flex-col gap-3 transition-all cursor-pointer group hover:border-brand-primary/50 hover:shadow-md",
                          isOutOfStock && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="aspect-square rounded-xl bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
                          {product.images?.[0] || product.image_url ? (
                            <img src={product.images?.[0] || product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="w-8 h-8 text-gray-300" /></div>
                          )}
                          
                          {/* Stock Quantity Badge */}
                          {!isOutOfStock && (
                            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-lg text-[10px] font-bold z-10">
                              {product.stock_quantity} {product.unit || 'قطعة'}
                            </div>
                          )}

                          {cartItem && (
                            <div className="absolute top-2 right-2 bg-brand-primary text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shadow-lg z-10">
                              {cartItem.quantity}
                            </div>
                          )}
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center z-10">
                              <span className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs font-bold">نفذت الكمية</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col flex-1 justify-between">
                          <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 mb-2">{product.name}</h3>
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-brand-primary font-bold">{Number(product.sell_price).toLocaleString()} {settings.currency}</span>
                            {product.purchase_price ? (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">تكلفة: {Number(product.purchase_price).toLocaleString()}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Left Side: Cart (Desktop) */}
          <div className="hidden lg:flex flex-col w-[400px] shrink-0 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            {renderCartContent()}
          </div>

          {/* Mobile Cart Floating Bar */}
          <div className="lg:hidden fixed bottom-16 left-0 right-0 p-4 z-40">
            <button 
              onClick={() => setIsMobileCartOpen(true)}
              className="w-full bg-brand-dark text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ShoppingCart className="w-6 h-6" />
                  <span className="absolute -top-2 -right-2 bg-brand-primary text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                    {cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
                  </span>
                </div>
                <span className="font-bold">عرض السلة</span>
              </div>
              <span className="font-bold text-lg">{cartSubtotal.toLocaleString()} {settings.currency}</span>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-6 h-6 text-brand-primary" />
              سجل الفواتير
            </h2>
            <button
              onClick={() => {
                import('../utils/pdfExport').then(module => {
                  module.exportTableToPDF('sales-history-table', 'سجل_المبيعات');
                });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white rounded-xl font-bold transition-colors"
            >
              <Download className="w-5 h-5" />
              تحميل PDF
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {/* Hidden Table for PDF Export */}
            <table id="sales-history-table" className="hidden w-full text-right border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">التاريخ</th>
                  <th className="border p-2">الإجمالي</th>
                  <th className="border p-2">المدفوع</th>
                  <th className="border p-2">الباقي</th>
                  <th className="border p-2">طريقة الدفع</th>
                  <th className="border p-2">الحالة</th>
                  <th className="border p-2">العميل</th>
                </tr>
              </thead>
              <tbody>
                {salesHistory.map(sale => (
                  <tr key={sale.id}>
                    <td className="border p-2">{new Date(sale.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="border p-2">{sale.total_amount.toLocaleString()}</td>
                    <td className="border p-2">{sale.paid_amount.toLocaleString()}</td>
                    <td className="border p-2">{(sale.total_amount - sale.paid_amount).toLocaleString()}</td>
                    <td className="border p-2">
                       {paymentMethodsList.find(pm => pm.method_id === sale.payment_method)?.name || sale.payment_method}
                    </td>
                    <td className="border p-2">{sale.is_custom_order ? (sale.status === 'delivered' ? 'تم التسليم' : sale.status === 'ready' ? 'جاهز' : sale.status === 'tailoring' ? 'قيد الخياطة' : 'قيد الانتظار') : ((sale.total_amount - sale.paid_amount) > 0 ? 'دفع جزئي' : 'مكتملة')}</td>
                    <td className="border p-2">{sale.customers?.name || 'عميل نقدي'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {salesHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                <History className="w-16 h-16 opacity-20" />
                <p className="font-medium text-lg">لا توجد فواتير سابقة</p>
              </div>
            ) : (
              <div className="space-y-4">
                {salesHistory.map(sale => (
                  <div 
                    key={sale.id} 
                    onClick={() => {
                      setSelectedSale(sale);
                      setIsSaleDetailsOpen(true);
                    }}
                    className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-bold text-gray-900 dark:text-white text-lg">
                          {sale.total_amount.toLocaleString()} {settings.currency}
                        </span>
                        {sale.is_custom_order ? (
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold",
                            sale.status === 'delivered' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            sale.status === 'ready' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                            sale.status === 'tailoring' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                            "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          )}>
                            {sale.status === 'delivered' ? 'تم التسليم' :
                             sale.status === 'ready' ? 'جاهز' :
                             sale.status === 'tailoring' ? 'قيد الخياطة' : 'قيد الانتظار'}
                          </span>
                        ) : (
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold",
                            (sale.total_amount - sale.paid_amount) > 0 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          )}>
                            {(sale.total_amount - sale.paid_amount) > 0 ? 'دفع جزئي' : 'مكتملة'}
                          </span>
                        )}
                        {sale.is_custom_order && (
                          <span className="bg-brand-primary/10 text-brand-primary px-2.5 py-1 rounded-lg text-xs font-bold">
                            طلب تفصيل
                          </span>
                        )}
                      </div>
                      
                      {/* Products Display */}
                      {sale.items && sale.items.length > 0 && (
                        <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 dark:text-gray-300">
                          <ShoppingCart className="w-4 h-4 text-gray-400" />
                          <div className="flex items-center gap-1 flex-wrap">
                            {sale.items.slice(0, 2).map((item, idx) => (
                              <span key={idx} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md text-xs font-medium">
                                {item.product_name} {item.quantity ? `(${item.quantity} ${item.unit || 'قطعة'})` : ''}
                              </span>
                            ))}
                            {sale.items.length > 2 && (
                              <span className="bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md text-xs font-bold">
                                +{sale.items.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {sale.customers?.name || 'عميل عام'}
                        </span>
                        <span>•</span>
                        <span>{new Date(sale.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-sm font-medium">
                      <p className="text-gray-500 dark:text-gray-400">المدفوع: <span className="text-gray-900 dark:text-white font-bold">{sale.paid_amount?.toLocaleString()} {settings.currency}</span></p>
                      {(sale.total_amount - sale.paid_amount) > 0 && (
                        <p className="text-orange-500">الباقي (دين): <span className="font-bold">{(sale.total_amount - sale.paid_amount).toLocaleString()} {settings.currency}</span></p>
                      )}
                    </div>
                  </div>
                ))}
                
                {salesHistory.length >= historyLimit && (
                  <div className="pt-4 flex justify-center">
                    <button
                      onClick={() => setHistoryLimit(prev => prev + 50)}
                      disabled={isLoadingMore}
                      className="px-6 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors flex items-center justify-center min-w-[200px]"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin ml-2 text-brand-primary" />
                          جاري التحميل...
                        </>
                      ) : (
                        'عرض المزيد'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Cart Modal */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-gray-900 lg:hidden animate-in slide-in-from-bottom-full duration-300" dir="rtl">
          <div className="flex-1 overflow-hidden flex flex-col">
            {renderCartContent(() => setIsMobileCartOpen(false))}
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">إضافة عميل سريع</h3>
              <button onClick={() => setIsQuickAddOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickAddCustomer} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">اسم العميل</label>
                <input 
                  type="text" required value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">رقم الهاتف</label>
                <input 
                  type="tel" required value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-brand-primary" dir="ltr"
                />
              </div>
              <button type="submit" disabled={isAddingCustomer} className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2">
                {isAddingCustomer ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>حفظ واختيار</span>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20 shrink-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-6 h-6 text-brand-primary" />
                إتمام الدفع
              </h3>
              <button 
                onClick={() => setIsCheckoutOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {checkoutError && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-start gap-2 text-sm font-bold border border-red-100 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{checkoutError}</p>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>المجموع الفرعي</span>
                  <span>{cartSubtotal.toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>الخصم</span>
                  <div className="flex items-center gap-2 w-32">
                    <input 
                      type="number" 
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none text-left"
                      placeholder="0"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xl font-bold text-gray-900 dark:text-white pt-3 border-t border-gray-200 dark:border-gray-700">
                  <span>الإجمالي المطلوب</span>
                  <span className="text-brand-primary">{cartTotal.toLocaleString()} {settings.currency}</span>
                </div>
              </div>

              {/* Sale Date */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ الفاتورة</label>
                <input 
                  type="date" 
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">طريقة الدفع</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {paymentMethodsList.map(method => {
                    const Icon = method.icon === 'Wallet' ? Wallet : method.icon === 'CreditCard' ? CreditCard : method.icon === 'Building' ? Building : Banknote;
                    return (
                    <button
                      key={method.id || method.method_id}
                      onClick={() => setPaymentMethod(method.method_id)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all",
                        paymentMethod === method.method_id 
                          ? `border-brand-primary ${method.bg || 'bg-brand-primary/10'}` 
                          : "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 justify-center hover:border-gray-200"
                      )}
                    >
                      <Icon className={cn("w-5 h-5", paymentMethod === method.method_id ? method.color : "text-gray-500")} />
                      <span className={cn("text-xs font-bold", paymentMethod === method.method_id ? method.color : "text-gray-500")}>{method.name}</span>
                    </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount Paid (Debt Calculation) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ المدفوع</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-all font-bold text-lg"
                    placeholder="أدخل المبلغ المدفوع"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">{settings.currency}</div>
                </div>
                {debtAmount > 0 && (
                  <div className="mt-3 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 p-3 rounded-xl flex items-start gap-2 text-sm font-bold border border-orange-100 dark:border-orange-800">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div>
                      <p>المبلغ المتبقي: {debtAmount.toLocaleString()} {settings.currency}</p>
                      {selectedCustomer ? (
                        <p className="text-xs mt-1 opacity-80">سيتم تسجيل هذا المبلغ كدين على العميل المختار.</p>
                      ) : (
                        <p className="text-xs mt-1 opacity-80 text-red-500">يجب اختيار عميل لتسجيل الدين!</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <button 
                onClick={handleCheckout}
                disabled={isProcessing || (debtAmount > 0 && !selectedCustomer)}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                <span>تأكيد العملية</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {checkoutSuccess && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center p-8 animate-in zoom-in-95 duration-300" dir="rtl">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">تمت العملية بنجاح!</h3>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">تم تسجيل المبيعات وتحديث المخزون.</p>
            
            <div className="space-y-3">
              <div className="flex gap-2">
                <button 
                  onClick={handlePrintLastReceipt}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <Printer className="w-5 h-5" />
                  <span>طباعة</span>
                </button>
                <button 
                  onClick={handleDownloadLastReceipt}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90"
                >
                  <Download className="w-5 h-5" />
                  <span>تحميل PDF</span>
                </button>
              </div>

              {/* Hidden Invoice for Printing */}
              <div id="last-invoice-print" className="hidden">
                <div className="space-y-6">
                  <div className="text-center border-b pb-4">
                    <h2 className="text-2xl font-bold">فاتورة مبيعات</h2>
                    <p className="text-gray-500">{new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border">
                      <p className="text-sm text-gray-500 mb-1">العميل</p>
                      <p className="font-bold">{lastReceipt?.customer?.name || 'عميل عام'}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border">
                      <p className="text-sm text-gray-500 mb-1">طريقة الدفع</p>
                      <p className="font-bold">{lastReceipt?.method === 'cash' ? 'كاش' : lastReceipt?.method}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold mb-3">المنتجات</h4>
                    <table className="w-full text-sm text-right border-collapse">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3">المنتج</th>
                          <th className="px-4 py-3">الكمية</th>
                          <th className="px-4 py-3">السعر</th>
                          <th className="px-4 py-3">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {lastReceipt?.items.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 font-medium">{item.product.name}</td>
                            <td className="px-4 py-3">{item.quantity} {item.product.unit || 'قطعة'}</td>
                            <td className="px-4 py-3">{Number(item.unit_price || 0).toLocaleString()} {settings.currency}</td>
                            <td className="px-4 py-3 font-bold">{(Number(item.quantity || 0) * Number(item.unit_price || 0)).toLocaleString()} {settings.currency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-gray-50 p-5 rounded-2xl border space-y-3">
                    <div className="flex justify-between text-sm font-medium text-gray-500">
                      <span>المجموع الفرعي</span>
                      <span>{lastReceipt?.subtotal.toLocaleString()} {settings.currency}</span>
                    </div>
                    {lastReceipt?.discount > 0 && (
                      <div className="flex justify-between text-sm font-medium text-gray-500">
                        <span>الخصم</span>
                        <span>{lastReceipt?.discount.toLocaleString()} {settings.currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold pt-3 border-t">
                      <span>الإجمالي</span>
                      <span>{lastReceipt?.total.toLocaleString()} {settings.currency}</span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-emerald-600">
                      <span>المدفوع</span>
                      <span>{lastReceipt?.paid.toLocaleString()} {settings.currency}</span>
                    </div>
                    {lastReceipt?.debt > 0 && (
                      <div className="flex justify-between text-sm font-bold text-orange-600 pt-3 border-t">
                        <span>المتبقي (دين)</span>
                        <span>{lastReceipt?.debt.toLocaleString()} {settings.currency}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {lastReceipt?.customer?.phone && (
                <button 
                  onClick={sendWhatsAppReceipt}
                  className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-[#25D366]/20 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>إرسال الفاتورة واتساب</span>
                </button>
              )}
              <button 
                onClick={() => {
                  setCheckoutSuccess(false);
                  setIsCheckoutOpen(false);
                }}
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 py-3.5 rounded-xl font-bold transition-colors"
              >
                بيع جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Details Modal */}
      {isSaleDetailsOpen && selectedSale && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300" dir="rtl">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-6 h-6 text-brand-primary" />
                تفاصيل الفاتورة
              </h3>
              <div className="flex items-center gap-2">
                {userRole !== 'seller' && (
                  <>
                    <button 
                      onClick={() => openEditSaleMode(selectedSale)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                      title="تعديل الفاتورة"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteSale(selectedSale.id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-full transition-colors"
                      title="حذف الفاتورة"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setIsSaleDetailsOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white dark:bg-gray-800 rounded-full shadow-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6" id="invoice-details">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">العميل</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-brand-primary" />
                    {selectedSale.customers?.name || 'عميل عام'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">التاريخ</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-primary" />
                    {new Date(selectedSale.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">طريقة الدفع</p>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-brand-primary" />
                    {paymentMethodsList.find(pm => pm.method_id === selectedSale.payment_method)?.name || selectedSale.payment_method}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">حالة الفاتورة</p>
                  <p className="font-bold text-gray-900 dark:text-white">
                    {selectedSale.is_custom_order ? (
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold",
                        selectedSale.status === 'delivered' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        selectedSale.status === 'ready' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        selectedSale.status === 'tailoring' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      )}>
                        {selectedSale.status === 'delivered' ? 'تم التسليم' :
                         selectedSale.status === 'ready' ? 'جاهز' :
                         selectedSale.status === 'tailoring' ? 'قيد الخياطة' : 'قيد الانتظار'}
                      </span>
                    ) : (
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold",
                        (selectedSale.total_amount - selectedSale.paid_amount) > 0 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      )}>
                        {(selectedSale.total_amount - selectedSale.paid_amount) > 0 ? 'دفع جزئي' : 'مكتملة'}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Items List */}
              {selectedSale.items && selectedSale.items.length > 0 && (
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-brand-primary" />
                    المنتجات
                  </h4>
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-100 dark:border-gray-800">
                        <tr>
                          <th className="px-4 py-3">المنتج</th>
                          <th className="px-4 py-3">الكمية</th>
                          <th className="px-4 py-3">السعر</th>
                          <th className="px-4 py-3">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {selectedSale.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.quantity} {item.unit || 'قطعة'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.unit_price ? `${item.unit_price.toLocaleString()} ${settings.currency}` : '-'}</td>
                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                              {item.quantity && item.unit_price ? `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>الإجمالي</span>
                  <span>{selectedSale.total_amount.toLocaleString()} {settings.currency}</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
                  <span>المدفوع</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{selectedSale.paid_amount.toLocaleString()} {settings.currency}</span>
                </div>
                {(selectedSale.total_amount - selectedSale.paid_amount) > 0 && (
                  <div className="flex justify-between text-sm font-bold text-orange-600 dark:text-orange-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span>الباقي (دين)</span>
                    <span>{(selectedSale.total_amount - selectedSale.paid_amount).toLocaleString()} {settings.currency}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex gap-3 print:hidden">
              <button 
                onClick={async () => {
                  try {
                    const invoiceData = {
                      title: selectedSale.is_custom_order ? 'فاتورة تفصيل' : 'فاتورة مبيعات',
                      invoiceNumber: selectedSale.id?.split('-')[0].toUpperCase(),
                      date: new Date(selectedSale.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                      customerName: selectedSale.customers?.name || 'عميل عام',
                      customerPhone: selectedSale.customers?.phone || '',
                      items: selectedSale.sale_items?.map((item: any) => ({
                        description: item.products?.name || item.product_id,
                        quantity: `${item.quantity} ${item.products?.unit || 'قطعة'}`,
                        price: `${item.unit_price.toLocaleString()} ${settings.currency}`,
                        total: `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}`
                      })) || [],
                      summary: [
                        { label: 'الإجمالي', value: `${selectedSale.total_amount.toLocaleString()} ${settings.currency}`, isBold: true },
                        { label: 'المدفوع', value: `${selectedSale.paid_amount.toLocaleString()} ${settings.currency}` },
                        ...((selectedSale.total_amount - selectedSale.paid_amount) > 0 ? [{ label: 'المتبقي (دين)', value: `${(selectedSale.total_amount - selectedSale.paid_amount).toLocaleString()} ${settings.currency}`, isBold: true, isGrandTotal: true }] : [])
                      ]
                    };
                    await generateInvoicePDF(settings, invoiceData, `فاتورة_${selectedSale.id.slice(0, 8)}`);
                  } catch (e) {
                    console.error(e);
                    toast.error('حدث خطأ أثناء تحميل הפاتورة');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/90"
              >
                <Download className="w-5 h-5" />
                <span>تحميل PDF</span>
              </button>
              <button 
                onClick={async () => {
                  try {
                    const invoiceData = {
                      title: selectedSale.is_custom_order ? 'فاتورة تفصيل' : 'فاتورة مبيعات',
                      invoiceNumber: selectedSale.id?.split('-')[0].toUpperCase(),
                      date: new Date(selectedSale.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                      customerName: selectedSale.customers?.name || 'عميل عام',
                      customerPhone: selectedSale.customers?.phone || '',
                      items: selectedSale.sale_items?.map((item: any) => ({
                        description: item.products?.name || item.product_id,
                        quantity: `${item.quantity} ${item.products?.unit || 'قطعة'}`,
                        price: `${item.unit_price.toLocaleString()} ${settings.currency}`,
                        total: `${(item.quantity * item.unit_price).toLocaleString()} ${settings.currency}`
                      })) || [],
                      summary: [
                        { label: 'الإجمالي', value: `${selectedSale.total_amount.toLocaleString()} ${settings.currency}`, isBold: true },
                        { label: 'المدفوع', value: `${selectedSale.paid_amount.toLocaleString()} ${settings.currency}` },
                        ...((selectedSale.total_amount - selectedSale.paid_amount) > 0 ? [{ label: 'المتبقي (دين)', value: `${(selectedSale.total_amount - selectedSale.paid_amount).toLocaleString()} ${settings.currency}`, isBold: true, isGrandTotal: true }] : [])
                      ]
                    };
                    await printInvoice(settings, invoiceData);
                  } catch (e) {
                    console.error(e);
                    toast.error('حدث خطأ أثناء الطباعة');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <Printer className="w-5 h-5" />
                <span>طباعة</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* View Sale Details Modal was up there */}
    </div>
  );
}
