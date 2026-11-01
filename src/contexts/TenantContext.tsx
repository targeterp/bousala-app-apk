import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface TenantContextType {
  tenantId: string | null;
  isLoadingTenant: boolean;
}

const TenantContext = createContext<TenantContextType>({ tenantId: null, isLoadingTenant: true });

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenantId, setTenantId] = useState<string | null>(localStorage.getItem('target_tenant_id'));
  const [isLoadingTenant, setIsLoadingTenant] = useState(!localStorage.getItem('target_tenant_id'));

  useEffect(() => {
    let isMounted = true;
    
    const fetchTenant = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) {
          if (isMounted) {
            setTenantId(null);
            localStorage.removeItem('target_tenant_id');
            setIsLoadingTenant(false);
          }
          return;
        }
        
        // Direct query to avoid RPC crashes
        const { data: accessData, error } = await supabase
          .from('store_user_access')
          .select('tenant_id')
          .eq('user_id', session.session.user.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching tenant ID directly:", error);
          if (isMounted) {
             setTenantId(session.session.user.id); // fallback
             localStorage.setItem('target_tenant_id', session.session.user.id);
          }
        } else if (isMounted) {
          const fetchedTenant = accessData?.tenant_id;
          // If they have an active employee record for ANOTHER store, use it.
          // Otherwise, they are their own tenant.
          const finalTenant = (fetchedTenant && fetchedTenant !== session.session.user.id) ? fetchedTenant : session.session.user.id;
          setTenantId(finalTenant);
          localStorage.setItem('target_tenant_id', finalTenant);
        }
      } catch (error) {
        console.error("Critical error fetching tenant:", error);
      } finally {
        if (isMounted) {
          setIsLoadingTenant(false);
        }
      }
    };
    
    fetchTenant();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchTenant();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <TenantContext.Provider value={{ tenantId, isLoadingTenant }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => useContext(TenantContext);
