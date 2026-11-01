import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useExpensesData(userId: string | null) {
  return useQuery({
    queryKey: ['expenses', userId],
    queryFn: async () => {
      if (!userId) return { expenses: [], categories: [], employees: [] };

      const [categoriesRes, employeesRes] = await Promise.all([
        supabase
          .from('expense_categories')
          .select('*')
          .eq('tenant_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('employees')
          .select('*')
          .eq('tenant_id', userId)
          .order('full_name', { ascending: true })
      ]);

      let expensesRes = await supabase
        .from('expenses')
        .select(`*, profiles:created_by (full_name), expense_categories (name), employees (full_name)`)
        .eq('tenant_id', userId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (expensesRes.error && (expensesRes.error.message.includes('relationship') || expensesRes.error.code === 'PGRST200')) {
        expensesRes = await supabase
          .from('expenses')
          .select(`*, profiles:created_by (full_name), expense_categories (name)`)
          .eq('tenant_id', userId)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
      }

      let fetchedCategories = categoriesRes.data || [];
      if (categoriesRes.error && categoriesRes.error.code === '42P01') {
        fetchedCategories = [
          { id: '1', name: 'رواتب' },
          { id: '2', name: 'إيجار' },
          { id: '3', name: 'فواتير (كهرباء، ماء، انترنت)' },
          { id: '4', name: 'تسويق' },
          { id: '5', name: 'مستلزمات' },
          { id: '6', name: 'أخرى' }
        ];
      } else {
        const hasSalaries = fetchedCategories.some(c => c.name === 'رواتب' || c.name === 'أجور');
        if (!hasSalaries) {
          const { data: newCat } = await supabase.from('expense_categories').insert([{ name: 'رواتب', tenant_id: true ? userId : null }]).select().single();
          if (newCat) fetchedCategories.push(newCat);
        }
      }

      return {
        expenses: expensesRes.data || [],
        categories: fetchedCategories,
        employees: employeesRes.data || []
      };
    },
    enabled: !!userId,
  });
}
