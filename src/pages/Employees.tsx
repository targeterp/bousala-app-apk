import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Trash2, Edit2, User, DollarSign, Shield, FileText, Lock } from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { useSettings } from '../contexts/SettingsContext';
import { useSubscription } from '../components/SubscriptionGuard';
import { useNavigate } from 'react-router-dom';

export function Employees() {
  const { settings } = useSettings();
  const { isExpired, setShowRenewModal } = useSubscription();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'employee',
    salary: '0',
    phone: ''
  });

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && (data === 'seller' || data === 'accountant')) {
        navigate('/');
      } else {
        fetchEmployees();
      }
    });
  }, [navigate]);

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      if (!userId) return;

      const employeesRes = await supabase
        .from('employees')
        .select('*')
        .eq('tenant_id', userId)
        .order('created_at', { ascending: false });

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('tenant_id', userId)
        .not('employee_id', 'is', null);

      if (expensesError) {
        console.warn('Expenses table might be missing employee_id column:', expensesError.message);
      }

      if (employeesRes.error) {
        if (employeesRes.error.code === '42P01') {
          console.warn('employees table does not exist yet. Please run the SQL migration.');
        } else {
          throw employeesRes.error;
        }
      }
      
      setEmployees(employeesRes.data || []);
      setExpenses(expensesData || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      // Ensure we don't leave state in a broken way
      setEmployees([]);
      setExpenses([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      const payload = {
        tenant_id: userId,
        full_name: formData.full_name,
        role: formData.role,
        salary: Number(formData.salary),
        phone: formData.phone
      };

      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingEmployee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employees')
          .insert([payload]);
        if (error) {
          if (error.code === '42P01') {
             toast.error('يرجى تنفيذ كود SQL الخاص بإنشاء جدول الموظفين أولاً.');
             return;
          }
          throw error;
        }
      }
      
      setIsModalOpen(false);
      resetForm();
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('حدث خطأ أثناء حفظ بيانات الموظف');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (employee: any) => {
    setEditingEmployee(employee);
    setFormData({
      full_name: employee.full_name,
      role: employee.role || 'employee',
      salary: employee.salary?.toString() || '0',
      phone: employee.phone || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (isExpired) {
      setShowRenewModal(true);
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    try {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
      fetchEmployees();
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('حدث خطأ أثناء حذف الموظف');
    }
  };

  const viewHistory = (employee: any) => {
    setSelectedEmployee(employee);
    setIsHistoryModalOpen(true);
  };

  const resetForm = () => {
    setEditingEmployee(null);
    setFormData({
      full_name: '',
      role: 'employee',
      salary: '0',
      phone: ''
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" id="employees-loader">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  const safeEmployees = Array.isArray(employees) ? employees : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  return (
    <div className="space-y-6" id="employees-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الموظفين</h1>
        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm shadow-brand-primary/20"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة موظف</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {safeEmployees.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-700">
            <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">لا يوجد موظفين</h3>
            <p className="text-gray-500 dark:text-gray-400">سيظهر الموظفون هنا بعد تسجيلهم في النظام</p>
          </div>
        ) : (
          safeEmployees.map((employee) => {
            if (!employee || !employee.id) return null;
            const employeeExpenses = safeExpenses.filter(e => e && e.employee_id === employee.id);
            const totalPaid = employeeExpenses.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
            
            return (
              <div key={employee.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-xl">
                      {(employee.full_name || 'م').charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{employee.full_name || 'موظف بدون اسم'}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {employee.role === 'admin' ? 'مدير النظام' : employee.role === 'manager' ? 'مدير متجر' : 'موظف مبيعات'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="p-2 text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                      title="تعديل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(employee.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">الراتب الأساسي</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {(Number(employee.salary) || 0).toFixed(2)} {settings?.currency || ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">إجمالي المدفوعات</span>
                    <span className="font-bold text-brand-primary">
                      {(totalPaid || 0).toLocaleString()} {settings?.currency || ''}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">الرصيد (سلف/عهد)</span>
                    <span className={`font-bold ${Number(employee.balance) > 0 ? 'text-red-500' : Number(employee.balance) < 0 ? 'text-green-500' : 'text-gray-900 dark:text-white'}`}>
                      {(Number(employee.balance) || 0).toLocaleString()} {settings?.currency || ''}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => viewHistory(employee)}
                    className="w-full mt-4 py-2 text-sm font-bold text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 rounded-xl transition-colors"
                  >
                    عرض سجل الرواتب
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                تعديل بيانات الموظف
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الاسم الكامل
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full pr-10 pl-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الدور / الصلاحية
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                >
                  <option value="employee">موظف مبيعات</option>
                  <option value="manager">مدير متجر</option>
                  <option value="admin">مدير النظام</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الراتب الأساسي ({settings.currency})
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                    className="w-full pr-10 pl-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  رقم الهاتف (اختياري)
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-brand-primary hover:bg-brand-dark text-white px-4 py-2.5 rounded-xl transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingEmployee ? 'تحديث' : 'إضافة')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl transition-colors font-medium"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary History Modal */}
      {isHistoryModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                سجل رواتب: {selectedEmployee.full_name}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => exportTableToPDF('salary-history-table', `سجل_رواتب_${selectedEmployee.full_name}`)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>تحميل PDF</span>
                </button>
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  إغلاق
                </button>
              </div>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <table id="salary-history-table" className="w-full text-right">
                <thead className="text-gray-500 dark:text-gray-400 text-sm border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="pb-3 font-bold">التاريخ</th>
                    <th className="pb-3 font-bold">الوصف</th>
                    <th className="pb-3 font-bold">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {safeExpenses
                    .filter(e => e && e.employee_id === selectedEmployee.id)
                    .sort((a, b) => {
                      const dateA = a?.date ? new Date(a.date).getTime() : 0;
                      const dateB = b?.date ? new Date(b.date).getTime() : 0;
                      return dateB - dateA;
                    })
                    .map((expense) => (
                      <tr key={expense.id}>
                        <td className="py-4 text-sm">
                          {expense.date ? new Date(expense.date).toLocaleDateString('ar-EG') : 'بدون تاريخ'}
                        </td>
                        <td className="py-4 text-sm text-gray-600 dark:text-gray-300">{expense.description || 'راتب شهري'}</td>
                        <td className="py-4 text-sm font-bold text-brand-primary">
                          {(Number(expense.amount) || 0).toLocaleString()} {settings?.currency || ''}
                        </td>
                      </tr>
                    ))}
                  {safeExpenses.filter(e => e && e.employee_id === selectedEmployee.id).length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-500">لا توجد مدفوعات مسجلة بعد</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <span className="font-bold text-gray-700 dark:text-gray-300">إجمالي ما تم صرفه</span>
              <span className="text-xl font-black text-brand-primary">
                {safeExpenses
                  .filter(e => e && e.employee_id === selectedEmployee.id)
                  .reduce((sum, e) => sum + (Number(e?.amount) || 0), 0)
                  .toLocaleString()} {settings?.currency || ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
