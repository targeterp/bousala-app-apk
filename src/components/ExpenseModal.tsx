import React, { useState, useEffect } from 'react';
import { DollarSign, Loader2, Edit3, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; full_name: string }>;
  paymentMethodsList: Array<{ id?: string; method_id: string; name: string }>;
  currency: string;
  tenantId: string | null;
  editingExpense: any | null;
}

export function ExpenseModal({
  isOpen,
  onClose,
  categories,
  employees,
  paymentMethodsList,
  currency,
  tenantId,
  editingExpense
}: ExpenseModalProps) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    category_id: '',
    employee_id: '',
    amount: '',
    payment_method: 'cash',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (editingExpense) {
      setForm({
        category_id: editingExpense.category_id || (categories[0]?.id || ''),
        employee_id: editingExpense.employee_id || '',
        amount: editingExpense.amount != null ? String(editingExpense.amount) : '',
        payment_method: editingExpense.payment_method || 'cash',
        description: editingExpense.description || '',
        date: editingExpense.date ? editingExpense.date.split('T')[0] : new Date().toISOString().split('T')[0]
      });
    } else {
      setForm({
        category_id: categories[0]?.id || '',
        employee_id: '',
        amount: '',
        payment_method: 'cash',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
  }, [editingExpense, categories, isOpen]);

  if (!isOpen) return null;

  const isEditMode = !!editingExpense;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!form.category_id) {
      toast.error('يرجى اختيار تصنيف للمصروف');
      return;
    }
    const numAmount = Number(form.amount);
    if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tenantId) throw new Error('يجب تسجيل الدخول أولاً');

      const selectedCategory = categories.find(c => c.id === form.category_id);
      const catName = selectedCategory?.name || 'مصروف عام';
      const isSalary = catName === 'رواتب' || catName === 'أجور';
      const empId = isSalary && form.employee_id ? form.employee_id : null;
      const emp = employees.find(e => e.id === empId);

      let descText = `${catName}: ${form.description || ''}`.trim();
      if (emp) {
        descText = `${catName} (${emp.full_name}): ${form.description || ''}`.trim();
      }

      if (isEditMode) {
        // --- 1. UPDATE EXPENSE IN EXPENSES TABLE ---
        const expenseUpdatePayload: any = {
          category_id: form.category_id,
          amount: numAmount,
          payment_method: form.payment_method,
          description: form.description,
          date: form.date,
          employee_id: empId
        };

        const { error: expUpdateErr } = await supabase
          .from('expenses')
          .update(expenseUpdatePayload)
          .eq('id', editingExpense.id);

        if (expUpdateErr) throw expUpdateErr;

        // --- 2. UPDATE OR SYNC TRANSACTION IN FINANCE LEDGER ---
        const { data: existingTx, error: txCheckErr } = await supabase
          .from('transactions')
          .select('id')
          .eq('reference_id', editingExpense.id);

        if (!txCheckErr && existingTx && existingTx.length > 0) {
          const { error: txUpdateErr } = await supabase
            .from('transactions')
            .update({
              amount: numAmount,
              date: form.date,
              payment_method: form.payment_method,
              description: descText,
              entity_type: empId ? 'employee' : 'general',
              entity_id: empId
            })
            .eq('reference_id', editingExpense.id);

          if (txUpdateErr) console.warn('Transactions update warning:', txUpdateErr);
        } else {
          // If transaction was missing, insert it so finance is synchronized
          await supabase.from('transactions').insert([{
            tenant_id: tenantId,
            type: 'expense',
            amount: numAmount,
            reference_type: 'expense',
            reference_id: editingExpense.id,
            description: descText,
            date: form.date,
            payment_method: form.payment_method || 'cash',
            entity_type: empId ? 'employee' : 'general',
            entity_id: empId,
            created_by: user.id
          }]);
        }

        toast.success('تم تعديل المصروف وحركته المالية بنجاح');
      } else {
        // --- ADD NEW EXPENSE ---
        let insertPayload: any = {
          tenant_id: tenantId,
          category_id: form.category_id,
          amount: numAmount,
          payment_method: form.payment_method,
          description: form.description,
          date: form.date,
          created_by: user.id
        };
        if (empId) insertPayload.employee_id = empId;

        const { data: newExp, error: insertErr } = await supabase
          .from('expenses')
          .insert([insertPayload])
          .select()
          .single();

        if (insertErr) {
          const fallback = { ...insertPayload };
          if (insertErr.message?.includes('payment_method') || insertErr.code === '42703') delete fallback.payment_method;
          if (insertErr.message?.includes('employee_id') || insertErr.code === '42703') delete fallback.employee_id;
          if (insertErr.message?.includes('created_by') || insertErr.message?.includes('foreign key')) delete fallback.created_by;

          const { error: retryErr } = await supabase.from('expenses').insert([fallback]);
          if (retryErr) throw retryErr;
        }

        // If insert succeeded and trigger might not exist or failed, ensure financial transaction exists
        if (newExp?.id) {
          const { data: checkTx } = await supabase
            .from('transactions')
            .select('id')
            .eq('reference_id', newExp.id);

          if (!checkTx || checkTx.length === 0) {
            await supabase.from('transactions').insert([{
              tenant_id: tenantId,
              type: 'expense',
              amount: numAmount,
              reference_type: 'expense',
              reference_id: newExp.id,
              description: descText,
              date: form.date,
              payment_method: form.payment_method || 'cash',
              entity_type: empId ? 'employee' : 'general',
              entity_id: empId,
              created_by: user.id
            }]);
          }
        }

        toast.success('تم تسجيل المصروف وحركته المالية بنجاح');
      }

      // Invalidate both caches immediately
      queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
      onClose();
    } catch (error: any) {
      console.error('Error saving expense:', error);
      toast.error(error.message || 'حدث خطأ أثناء حفظ المصروف');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === form.category_id);
  const isSalaryCategory = selectedCategory?.name === 'رواتب' || selectedCategory?.name === 'أجور';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {isEditMode ? (
              <>
                <Edit3 className="w-6 h-6 text-blue-600" />
                <span>تعديل المصروف</span>
              </>
            ) : (
              <>
                <DollarSign className="w-6 h-6 text-brand-primary" />
                <span>تسجيل مصروف جديد</span>
              </>
            )}
          </h2>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">التصنيف</label>
            <select
              required
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Show employee select only if category is salaries */}
          {isSalaryCategory && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-sm font-bold text-brand-primary mb-2">الموظف (اختياري)</label>
              <select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                className="w-full p-3 bg-brand-primary/5 border-2 border-brand-primary/20 rounded-xl focus:border-brand-primary outline-none transition-colors text-gray-900 dark:text-white"
              >
                <option value="">-- ربط المصروف بموظف --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white"
            >
              {paymentMethodsList.map(method => (
                <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
              المبلغ ({currency})
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="any"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white font-bold"
              placeholder="مثال: 50.00"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الوصف / البيان</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white"
              placeholder="سبب المصروف (اختياري)"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">التاريخ</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white"
            />
          </div>

          {/* Sync Notice */}
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 font-medium">
            💡 {isEditMode ? 'سيتم تحديث المصروف وتحديث حركته المالية في سجل المالية فوراً.' : 'سيتم قيد المصروف في المصروفات وتسجيل حركته المالية في المالية تلقائياً.'}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="submit"
              disabled={isSaving}
              className={`flex-1 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                isEditMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-brand-primary hover:bg-brand-secondary'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isEditMode ? (
                <Edit3 className="w-5 h-5" />
              ) : (
                <DollarSign className="w-5 h-5" />
              )}
              <span>{isEditMode ? 'حفظ التعديلات' : 'حفظ المصروف'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
