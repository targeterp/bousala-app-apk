import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

export interface PaymentMethod {
  id?: string;
  method_id: string;
  name: string;
  type?: string;
  icon?: string;
  color?: string;
  bg?: string;
}

export function usePaymentMethods() {
  const { tenantId } = useTenant();

  return useQuery({
    queryKey: ['payment_methods', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('tenant_id', tenantId);
        
      if (error) {
        console.error('Error fetching payment methods:', error);
        return getDefaultMethods();
      }
      
      if (!data || data.length === 0) {
        return getDefaultMethods();
      }
      
      const defaultMethods = getDefaultMethods();
      const fetchedMethodIds = new Set(data.map((m: any) => m.method_id));
      const missingDefaults = defaultMethods.filter(m => !fetchedMethodIds.has(m.method_id));
      
      return [...missingDefaults, ...data] as PaymentMethod[];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  });
}

function getDefaultMethods(): PaymentMethod[] {
  return [
    { method_id: 'cash', name: 'نقدي (كاش)', type: 'cash', icon: 'Wallet', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { method_id: 'bankily', name: 'بنكيلي', type: 'mobile_money', icon: 'Building', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    { method_id: 'masrvi', name: 'مصرفي', type: 'mobile_money', icon: 'Building', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    { method_id: 'sedad', name: 'سداد', type: 'mobile_money', icon: 'Building', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' }
  ];
}
