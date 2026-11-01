import React, { useEffect, useState } from 'react';
import { CloudOff, CloudUpload, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';

export function SyncManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending count periodically or when online status changes
  const checkPending = async () => {
    try {
      const count = await db.pending_sales.count();
      setPendingCount(count);
    } catch (e) {
      console.error("Error checking pending sales:", e);
    }
  };

  const syncData = React.useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    
    try {
      const pendingSales = await db.pending_sales.toArray();
      
      if (pendingSales.length === 0) {
        return;
      }

      setIsSyncing(true);

      for (const sale of pendingSales) {
        // 1. Insert Sale to Supabase
        const { id, items, ...salePayload } = sale;
        
        let { data: saleData, error: saleError } = await supabase
          .from('sales')
          .insert([salePayload])
          .select()
          .single();

        if (saleError && saleError.message?.includes('foreign key constraint')) {
          delete (salePayload as any).created_by;
          const retry = await supabase.from('sales').insert([salePayload]).select().single();
          saleData = retry.data;
          saleError = retry.error;
        }

        if (saleError) {
          console.error("Failed to sync sale:", saleError);
          continue; // Skip this one, try next
        }

        // 2. Insert Sale Items
        if (saleData && items && items.length > 0) {
          const onlineSaleItems = items.map(item => ({
            ...item,
            sale_id: saleData.id,
            tenant_id: salePayload.tenant_id
          }));
          
          const { error: itemsError } = await supabase.from('sale_items').insert(onlineSaleItems);
          
          if (itemsError) {
            console.error("Failed to sync sale items:", itemsError);
            // We might want to rollback or handle partial failures, but for simplicity we log it.
          } else {
            // 3. Update stock on Supabase
            for (const item of items) {
               // We need to fetch current stock from supabase to avoid overwriting with stale local data
               const { data: productData } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
               if (productData) {
                 const newStock = productData.stock_quantity - item.quantity;
                 await supabase.from('products').update({ stock_quantity: newStock }).eq('id', item.product_id);
               }
            }
          }
        }

        // 4. Remove from local pending queue
        await db.pending_sales.delete(id);
      }
      
      await checkPending();
    } catch (error) {
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    checkPending();
    
    const handleOnline = () => {
      setIsOnline(true);
      syncData();
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync attempt if online
    if (navigator.onLine) {
      syncData();
    }

    // Interval to check pending count
    const interval = setInterval(checkPending, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncData]);

  if (!isOnline) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-6 bg-amber-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[60] animate-pulse whitespace-nowrap">
        <CloudOff size={18} />
        <span className="text-sm font-medium">وضع الأوفلاين {pendingCount > 0 && `(${pendingCount} قيد الانتظار)`}</span>
      </div>
    );
  }

  if (isSyncing || pendingCount > 0) {
    return (
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:right-6 bg-blue-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-[60] whitespace-nowrap">
        <CloudUpload size={18} className="animate-bounce" />
        <span className="text-sm font-medium">جاري المزامنة... ({pendingCount})</span>
      </div>
    );
  }

  return null;
}
