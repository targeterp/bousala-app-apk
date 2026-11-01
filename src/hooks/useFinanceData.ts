import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useFinanceData(tenantId: string | null) {
  return useQuery({
    queryKey: ['finance', tenantId],
    queryFn: async () => {
      if (!tenantId) {
        return {
          transactions: [],
          customers: [],
          suppliers: [],
          employees: [],
          partners: [],
          paymentMethods: []
        };
      }

      const [txRes, customersRes, suppliersRes, employeesRes, partnersRes, paymentMethodsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select(`*, profiles:created_by (full_name)`)
          .eq('tenant_id', tenantId)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('customers').select('*').eq('tenant_id', tenantId),
        supabase.from('suppliers').select('*').eq('tenant_id', tenantId),
        supabase.from('employees').select('*').eq('tenant_id', tenantId),
        supabase.from('partners').select('*').eq('tenant_id', tenantId),
        supabase.from('payment_methods').select('*').eq('tenant_id', tenantId)
      ]);

      const defaultPaymentMethods = [
        { method_id: 'cash', name: 'نقدي (كاش)', type: 'cash', icon: 'Wallet', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
        { method_id: 'bankily', name: 'بنكيلي (Bankily)', type: 'mobile_money', icon: 'Building', color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
        { method_id: 'masrvi', name: 'مصرفي (Masrvi)', type: 'mobile_money', icon: 'Building', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
        { method_id: 'sedad', name: 'سداد (Sedad)', type: 'mobile_money', icon: 'Building', color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' }
      ];
      
      const fetchedPaymentMethods = paymentMethodsRes.data || [];
      const fetchedMethodIds = new Set(fetchedPaymentMethods.map((m: any) => m.method_id));
      const missingDefaults = defaultPaymentMethods.filter(m => !fetchedMethodIds.has(m.method_id));
      
      const mergedPaymentMethods = [...missingDefaults, ...fetchedPaymentMethods];

      return {
        transactions: txRes.data || [],
        customers: customersRes.data || [],
        suppliers: suppliersRes.data || [],
        employees: employeesRes.data || [],
        partners: partnersRes.data || [],
        paymentMethods: mergedPaymentMethods
      };
    },
    enabled: !!tenantId,
  });
}
