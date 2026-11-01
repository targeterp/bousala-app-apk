import toast from 'react-hot-toast';
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Trash2, Edit2, PieChart, List, FolderPlus, FileText } from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../utils';
import { useSubscription } from '../components/SubscriptionGuard';
import { useTenant } from '../contexts/TenantContext';
import { useExpensesData } from '../hooks/useExpensesData';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { ExpenseModal } from '../components/ExpenseModal';

export function Expenses() {
  const { settings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: paymentMethodsList = [] } = usePaymentMethods();

  const [activeTab, setActiveTab] = useState<'history' | 'categories'>('history');
  
  const { data, isLoading } = useExpensesData(tenantId);
  const expenses = data?.expenses || [];
  const categories = data?.categories || [];
  const employees = data?.employees || [];
  
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleOpenAddExpense = () => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    setEditingExpense(null);
    setIsExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: any) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    setEditingExpense(expense);
    setIsExpenseModalOpen(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!newCategoryName.trim() || isSavingCategory) return;
    setIsSavingCategory(true);
    try {
      if (!tenantId) return;

      const { error } = await supabase
        .from('expense_categories')
        .insert([{ name: newCategoryName.trim(), tenant_id: tenantId }]);
        
      if (error) throw error;
      
      setIsCategoryModalOpen(false);
      setNewCategoryName('');
      queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
      toast.success('تمت إضافة التصنيف بنجاح');
    } catch (error: any) {
      console.error('Error saving category:', error);
      if (error.code === '42P01') {
        toast.error('جدول التصنيفات غير مهيأ');
      } else {
        toast.error('حدث خطأ أثناء حفظ التصنيف (قد يكون الاسم مكرراً)');
      }
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟ سيتم حذف حركته المالية في المالية نهائياً وإلغاء تأثيرها على الحسابات.')) return;

    // Optimistically update UI in expenses
    queryClient.setQueryData(['expenses', tenantId], (oldData: any) => {
      if (!oldData || !oldData.expenses) return oldData;
      return { ...oldData, expenses: oldData.expenses.filter((e: any) => e.id !== id) };
    });

    const promise = (async () => {
      // 1. Delete associated transaction(s) in financial records
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('reference_id', id);

      if (txError) {
        console.warn('Error deleting associated transaction:', txError);
      }

      // Also ensure transactions where reference_type = 'expense' and reference_id = id are cleared
      await supabase
        .from('transactions')
        .delete()
        .eq('reference_id', id)
        .eq('reference_type', 'expense');

      // 2. Delete the expense record
      const { error: expError } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (expError) throw expError;

      // Invalidate both caches so Finance page and Expenses page update immediately!
      queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
    })();

    toast.promise(promise, {
      loading: 'جاري حذف المصروف وحركته المالية...',
      success: 'تم حذف المصروف وحركته المالية بنجاح',
      error: () => {
        queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
        queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
        return 'حدث خطأ أثناء الحذف';
      }
    });
  };

  const categoryTotals = categories.map(cat => {
    const total = expenses
      .filter(e => e.category_id === cat.id)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { ...cat, total };
  }).sort((a, b) => b.total - a.total);

  const totalExpenses = categoryTotals.reduce((sum, cat) => sum + cat.total, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المصروفات</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">إدارة وتتبع النفقات وتصنيفاتها وتأثيرها المالي.</p>
          </div>
          
          <div className="hidden sm:block w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
          
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-3 sm:px-5 sm:py-3 shrink-0 flex flex-col justify-center min-w-[160px]">
            <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">إجمالي المصروفات</p>
            <p className="text-xl font-black text-red-600 dark:text-red-400">
              {totalExpenses.toLocaleString()} <span className="text-sm font-bold opacity-70">{settings.currency}</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {activeTab === 'categories' && (
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-xs"
            >
              <FolderPlus className="w-5 h-5" />
              <span>تصنيف جديد</span>
            </button>
          )}
          {activeTab === 'history' && (
            <button
              onClick={() => exportTableToPDF('expenses-table', 'تقرير_المصروفات')}
              className="p-2.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors shadow-xs"
              title="تصدير PDF"
            >
              <FileText className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleOpenAddExpense}
            className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-secondary transition-colors shadow-sm flex items-center gap-2 mr-auto sm:mr-0"
          >
            <Plus className="w-5 h-5" />
            <span>تسجيل مصروف</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100/50 dark:bg-gray-800/50 p-1.5 rounded-2xl w-max border border-gray-200/50 dark:border-gray-700/50">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-200",
            activeTab === 'history' 
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <List className="w-4 h-4" />
          <span>سجل المصروفات</span>
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-200",
            activeTab === 'categories' 
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          <PieChart className="w-4 h-4" />
          <span>التصنيفات والإحصائيات</span>
        </button>
      </div>

      {/* Tab Content: Categories */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryTotals.map((cat, idx) => {
            const percentage = totalExpenses > 0 ? ((cat.total / totalExpenses) * 100).toFixed(1) : '0';
            const count = expenses.filter(e => e.category_id === cat.id).length;
            return (
              <div key={cat.id || idx} className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <PieChart className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-1 rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-600/50">
                      {count} عملية
                    </span>
                    <span className="text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-lg border border-red-100 dark:border-red-800/30 shadow-sm">
                      {percentage}% من الإجمالي
                    </span>
                  </div>
                </div>
                <div className="relative z-10">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">{cat.name}</h3>
                  <p className="text-2xl font-black text-gray-900 dark:text-white">
                    {cat.total.toLocaleString()} <span className="text-sm font-bold text-gray-400 dark:text-gray-500">{settings.currency}</span>
                  </p>
                </div>
                
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-100 dark:bg-gray-800/50">
                  <div 
                    className="h-full bg-red-500 transition-all duration-1000 ease-out"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
          {categoryTotals.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 font-medium bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              لا توجد تصنيفات. قم بإضافة تصنيف جديد.
            </div>
          )}
        </div>
      )}

      {/* Tab Content: History List */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table id="expenses-table" className="w-full text-right">
              <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
                <tr>
                  <th className="p-4 text-gray-500 dark:text-gray-400 font-bold text-sm">التاريخ</th>
                  <th className="p-4 text-gray-500 dark:text-gray-400 font-bold text-sm">التصنيف</th>
                  <th className="p-4 text-gray-500 dark:text-gray-400 font-bold text-sm">الوصف</th>
                  <th className="p-4 text-gray-500 dark:text-gray-400 font-bold text-sm">طريقة الدفع</th>
                  <th className="p-4 text-gray-500 dark:text-gray-400 font-bold text-sm">المبلغ</th>
                  <th className="p-4 text-center text-gray-500 dark:text-gray-400 font-bold text-sm">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-4 pb-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900 dark:text-gray-100">
                          {new Date(expense.date).toLocaleDateString('ar-EG')}
                        </span>
                        {expense.profiles?.full_name && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            بواسطة: {expense.profiles.full_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 pb-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 font-medium text-gray-700 dark:text-gray-300 text-sm border border-gray-200/50 dark:border-gray-600/50">
                        {expense.expense_categories?.name}
                      </span>
                    </td>
                    <td className="p-4 pb-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-700 dark:text-gray-300">
                          {expense.description || '-'}
                        </span>
                        {expense.employees && (
                          <span className="text-xs text-brand-primary bg-brand-primary/10 w-max px-2 py-0.5 rounded-md">
                            الراتب/الأجر لـ: {expense.employees.full_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 pb-4 text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">
                       {paymentMethodsList.find(pm => pm.method_id === expense.payment_method)?.name || expense.payment_method}
                    </td>
                    <td className="p-4 pb-4">
                      <span className="font-black text-red-600 dark:text-red-400 text-lg">
                        {expense.amount?.toLocaleString()} <span className="text-xs opacity-70">{settings.currency}</span>
                      </span>
                    </td>
                    <td className="p-4 pb-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEditExpense(expense)}
                          className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors tooltip"
                          title="تعديل المصروف وحركته المالية"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors tooltip"
                          title="حذف المصروف وحركته المالية"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 font-medium">
                      لا توجد مصروفات مسجلة بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Expense Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        categories={categories}
        employees={employees}
        paymentMethodsList={paymentMethodsList}
        currency={settings.currency}
        tenantId={tenantId}
        editingExpense={editingExpense}
      />

      {/* Add Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FolderPlus className="w-6 h-6 text-brand-primary" />
                <span>تصنيف مصروف جديد</span>
              </h2>
            </div>
            
            <form onSubmit={handleAddCategory} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم التصنيف</label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-brand-primary focus:ring-0 outline-none transition-colors text-gray-900 dark:text-white"
                  placeholder="مثال: الضيافة"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="flex-1 bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingCategory ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  <span>إضافة</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCategoryModalOpen(false);
                    setNewCategoryName('');
                  }}
                  className="px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
