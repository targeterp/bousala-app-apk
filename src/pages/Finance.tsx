import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Calendar, FileText, Plus, CreditCard, Wallet, Building, Users, Briefcase, ArrowRightLeft, FileDown } from 'lucide-react';
import { exportTableToPDF } from '../utils/pdfExport';
import { generatePartnerStatementPDF } from '../utils/pdfGenerator';
import { useSettings } from '../contexts/SettingsContext';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';
import { useFinanceData } from '../hooks/useFinanceData';
import { useQueryClient } from '@tanstack/react-query';

export function Finance() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'transactions' | 'partners'>('transactions');
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data, isLoading } = useFinanceData(tenantId);
  const transactions = data?.transactions || [];
  const paymentMethodsList = data?.paymentMethods || [];
  
  let income = 0;
  let expense = 0;
  const paymentMethodsSummary: Record<string, number> = {};
  paymentMethodsList.forEach(pm => paymentMethodsSummary[pm.method_id] = 0);
  
  transactions.forEach(t => {
    const amount = Number(t.amount) || 0;
    const method = t.payment_method || 'cash';
    if (method === 'debt_record' || t.reference_type === 'custom_order_debt') return;
    if (t.type === 'income') {
      income += amount;
      paymentMethodsSummary[method] = (paymentMethodsSummary[method] || 0) + amount;
    }
    if (t.type === 'expense') {
      expense += amount;
      paymentMethodsSummary[method] = (paymentMethodsSummary[method] || 0) - amount;
    }
  });

  const summary = { income, expense, balance: income - expense };
  
  // Vouchers State
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const entities = {
    customer: (data?.customers || []).filter((c: any) => c.is_active !== false && !c.is_archived),
    supplier: data?.suppliers || [],
    employee: (data?.employees || []).map((e: any) => ({ id: e.id, name: e.full_name, balance: e.balance })),
    partner: data?.partners || []
  };
  
  const [voucherForm, setVoucherForm] = useState({
    type: 'income', // 'income' (قبض) or 'expense' (صرف)
    amount: '',
    payment_method: 'cash',
    entity_type: 'general',
    entity_id: '',
    order_id: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentTransactions = transactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };


  // Partners State
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [isSavingPartner, setIsSavingPartner] = useState(false);
  const [selectedPartnerForLedger, setSelectedPartnerForLedger] = useState<any | null>(null);
  const [isExportingPartnerPDF, setIsExportingPartnerPDF] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    name: '',
    phone: '',
    share_percentage: ''
  });

  // Transfer State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_account: 'cash',
    to_account: 'bankily',
    amount: '',
    notes: ''
  });

  // Role State
  const [userRole, setUserRole] = useState<string | null>(null);

  // Capital & Wallet State
  const [isCapitalModalOpen, setIsCapitalModalOpen] = useState(false);
  const [isSavingCapital, setIsSavingCapital] = useState(false);
  const [capitalForm, setCapitalForm] = useState({
    amount: '',
    payment_method: 'cash',
    notes: ''
  });

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isSavingWallet, setIsSavingWallet] = useState(false);
  const [walletForm, setWalletForm] = useState({
    name: '',
    method_id: '',
    type: 'bank',
    icon: 'Building',
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30'
  });

  useEffect(() => {
    supabase.rpc('get_current_user_role').then(({ data, error }) => {
      if (!error && data) {
        setUserRole(data);
        if (data === 'seller') {
          navigate('/');
        } else {
          queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }
      }
    });
  }, [navigate]);

          
      const handleSaveCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCapital) return;
    
    const amount = Number(capitalForm.amount);
    if (amount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    setIsSavingCapital(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc('inject_capital', {
        p_amount: amount,
        p_payment_method: capitalForm.payment_method,
        p_notes: capitalForm.notes,
        p_tenant_id: tenantId,
        p_user_id: user?.id
      });
      
      if (error) throw error;
      
      toast.success('تمت إضافة رأس المال بنجاح');
      setIsCapitalModalOpen(false);
      setCapitalForm({ amount: '', payment_method: 'cash', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
    } catch (error: any) {
      console.error('Error adding capital:', error);
      toast.error(error.message || 'حدث خطأ أثناء إضافة رأس المال');
    } finally {
      setIsSavingCapital(false);
    }
  };

  const handleSaveWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingWallet) return;
    
    setIsSavingWallet(true);
    try {
      const { error } = await supabase.from('payment_methods').insert([{
        tenant_id: tenantId,
        name: walletForm.name,
        method_id: walletForm.method_id,
        type: walletForm.type,
        icon: walletForm.icon,
        color: walletForm.color,
        bg: walletForm.bg
      }]);
      
      if (error) throw error;
      
      toast.success('تمت إضافة المحفظة بنجاح');
      setIsWalletModalOpen(false);
      setWalletForm({
        name: '',
        method_id: '',
        type: 'bank',
        icon: 'Building',
        color: 'text-blue-600',
        bg: 'bg-blue-100 dark:bg-blue-900/30'
      });
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
    } catch (error: any) {
      console.error('Error adding wallet:', error);
      toast.error(error.message || 'حدث خطأ أثناء إضافة المحفظة');
    } finally {
      setIsSavingWallet(false);
    }
  };

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
    const txDate = tx.date 
      ? new Date(tx.date).toISOString().split('T')[0] 
      : (tx.created_at ? new Date(tx.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    setVoucherForm({
      type: tx.type,
      amount: tx.amount.toString(),
      payment_method: tx.payment_method || 'cash',
      entity_type: tx.entity_type || 'general',
      entity_id: tx.entity_id || '',
      order_id: '',
      description: tx.description || '',
      date: txDate
    });
    setIsVoucherModalOpen(true);
  };

  const handleDeleteClick = (tx: any) => {
    setTransactionToDelete(tx);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    const tx = transactionToDelete;
    
    try {
      // Reverse balance effect if applicable
      if (tx.entity_type && tx.entity_id) {
        const amount = Number(tx.amount);
        if (tx.entity_type === 'customer') {
          const { data: customer } = await supabase.from('customers').select('balance').eq('id', tx.entity_id).single();
          if (customer) {
            const newBalance = tx.type === 'income' ? Number(customer.balance) + amount : Number(customer.balance) - amount;
            await supabase.from('customers').update({ balance: newBalance }).eq('id', tx.entity_id);
          }
          
          // If it was linked to an order, reverse the order's paid_amount
          if (tx.reference_id && (tx.reference_type === 'custom_order_payment' || tx.reference_type === 'customer_debt_payment')) {
            // Check if reference_id is an order (not the customer itself)
            if (tx.reference_id !== tx.entity_id) {
              const { data: order } = await supabase.from('custom_orders').select('paid_amount').eq('id', tx.reference_id).single();
              if (order) {
                const newPaidAmount = Number(order.paid_amount || 0) - amount;
                await supabase.from('custom_orders').update({ paid_amount: newPaidAmount }).eq('id', tx.reference_id);
              }
            }
          }
        } else if (tx.entity_type === 'supplier') {
          const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', tx.entity_id).single();
          if (supplier) {
            const newBalance = tx.type === 'expense' ? Number(supplier.balance) + amount : Number(supplier.balance) - amount;
            await supabase.from('suppliers').update({ balance: newBalance }).eq('id', tx.entity_id);
          }
        } else if (tx.entity_type === 'partner') {
          const { data: partner } = await supabase.from('partners').select('balance').eq('id', tx.entity_id).single();
          if (partner) {
            const newBalance = tx.type === 'income' ? Number(partner.balance) - amount : Number(partner.balance) + amount;
            await supabase.from('partners').update({ balance: newBalance }).eq('id', tx.entity_id);
          }
        } else if (tx.entity_type === 'employee') {
          const { data: employee } = await supabase.from('employees').select('balance').eq('id', tx.entity_id).single();
          if (employee) {
            const newBalance = tx.type === 'expense' ? Number(employee.balance) - amount : Number(employee.balance) + amount;
            await supabase.from('employees').update({ balance: newBalance }).eq('id', tx.entity_id);
          }
        }
      }

      // If deleting an expense transaction, also remove the expense record
      if (tx.reference_type === 'expense' && tx.reference_id) {
        await supabase.from('expenses').delete().eq('id', tx.reference_id);
        queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
      }

      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['expenses', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      
      toast.success('تم حذف المعاملة بنجاح');
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      toast.error('حدث خطأ أثناء حذف المعاملة: ' + error.message);
    } finally {
      setTransactionToDelete(null);
    }
  };

  useEffect(() => {
    if (voucherForm.entity_type === 'customer' && voucherForm.entity_id) {
      const fetchOrders = async () => {
        const { data } = await supabase.from('custom_orders')
          .select('id, total_price, paid_amount, advance_payment, status')
          .eq('customer_id', voucherForm.entity_id)
          .neq('status', 'cancelled');
        
        if (data) {
          setCustomerOrders(data.filter(o => Number(o.total_price) > Number(o.paid_amount || o.advance_payment)));
        }
      };
      fetchOrders();
    } else {
      setCustomerOrders([]);
    }
  }, [voucherForm.entity_type, voucherForm.entity_id]);

  const handleSaveVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingVoucher) return;
    
    // Check validation sync
    const amount = Number(voucherForm.amount);
    if (amount <= 0) {
      toast.error("المبلغ يجب أن يكون أكبر من 0");
      return;
    }

    const savedForm = { ...voucherForm };
    const savedEditing = editingTransaction ? { ...editingTransaction } : null;

    // Optimistic UI updates
    setIsVoucherModalOpen(false);
    setEditingTransaction(null);
    setVoucherForm({
      type: 'income',
      amount: '',
      payment_method: 'cash',
      entity_type: 'general',
      entity_id: '',
      order_id: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });

    const promise = (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;
      if (!userId) throw new Error("Not authenticated");

      if (savedEditing && savedEditing.entity_type && savedEditing.entity_id) {
        const oldAmount = Number(savedEditing.amount);
        if (savedEditing.entity_type === 'customer') {
          const { data: customer } = await supabase.from('customers').select('balance').eq('id', savedEditing.entity_id).single();
          if (customer) {
            const revertedBalance = savedEditing.type === 'income' ? Number(customer.balance) + oldAmount : Number(customer.balance) - oldAmount;
            await supabase.from('customers').update({ balance: revertedBalance }).eq('id', savedEditing.entity_id);
          }
        } else if (savedEditing.entity_type === 'supplier') {
          const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', savedEditing.entity_id).single();
          if (supplier) {
            const revertedBalance = savedEditing.type === 'expense' ? Number(supplier.balance) + oldAmount : Number(supplier.balance) - oldAmount;
            await supabase.from('suppliers').update({ balance: revertedBalance }).eq('id', savedEditing.entity_id);
          }
        } else if (savedEditing.entity_type === 'partner') {
          const { data: partner } = await supabase.from('partners').select('balance').eq('id', savedEditing.entity_id).single();
          if (partner) {
            const revertedBalance = savedEditing.type === 'income' ? Number(partner.balance) - oldAmount : Number(partner.balance) + oldAmount;
            await supabase.from('partners').update({ balance: revertedBalance }).eq('id', savedEditing.entity_id);
          }
        } else if (savedEditing.entity_type === 'employee') {
          const { data: employee } = await supabase.from('employees').select('balance').eq('id', savedEditing.entity_id).single();
          if (employee) {
            const revertedBalance = savedEditing.type === 'expense' ? Number(employee.balance) - oldAmount : Number(employee.balance) + oldAmount;
            await supabase.from('employees').update({ balance: revertedBalance }).eq('id', savedEditing.entity_id);
          }
        }
      }

      const chosenDate = savedForm.date || new Date().toISOString().split('T')[0];
      const chosenDateTime = new Date(chosenDate + 'T12:00:00Z').toISOString();

      const txPayload = {
        tenant_id: userId,
        type: savedForm.type,
        amount: amount,
        payment_method: savedForm.payment_method,
        entity_type: savedForm.entity_type !== 'general' ? savedForm.entity_type : null,
        entity_id: savedForm.entity_id || null,
        reference_type: savedForm.order_id ? 'custom_order' : null,
        reference_id: savedForm.order_id || null,
        description: savedForm.description,
        date: chosenDate,
        created_at: chosenDateTime
      };

      if (savedForm.entity_type === 'customer' && savedForm.entity_id && savedForm.type === 'income' && !savedEditing) {
        let rpcDone = false;
        try {
          const { error } = await supabase.rpc('pay_customer_debt', {
            p_customer_id: savedForm.entity_id,
            p_amount: amount,
            p_payment_method: savedForm.payment_method,
            p_user_id: userId,
            p_order_id: savedForm.order_id || null,
            p_date: chosenDate,
            p_description: savedForm.description || null
          });
          if (!error) rpcDone = true;
        } catch (e) {
          console.warn('pay_customer_debt with date error:', e);
        }

        if (!rpcDone) {
          const { error: err2 } = await supabase.rpc('pay_customer_debt', {
            p_customer_id: savedForm.entity_id,
            p_amount: amount,
            p_payment_method: savedForm.payment_method,
            p_user_id: userId,
            p_order_id: savedForm.order_id || null
          });
          if (err2) throw err2;
          
          if (chosenDate) {
            await supabase
              .from('transactions')
              .update({ date: chosenDate, created_at: chosenDateTime })
              .eq('entity_id', savedForm.entity_id)
              .eq('tenant_id', userId)
              .order('created_at', { ascending: false })
              .limit(1);
          }
        }
      } else {
        if (savedEditing) {
          const { error } = await supabase.from('transactions').update(txPayload).eq('id', savedEditing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('transactions').insert([txPayload]);
          if (error) throw error;
        }

        if (savedForm.entity_type && savedForm.entity_id) {
          if (savedForm.entity_type === 'customer') {
            const { data: customer } = await supabase.from('customers').select('balance').eq('id', savedForm.entity_id).single();
            if (customer) {
              const newBalance = savedForm.type === 'income' 
                ? Number(customer.balance) - amount 
                : Number(customer.balance) + amount;
              await supabase.from('customers').update({ balance: newBalance }).eq('id', savedForm.entity_id);
            }
          } else if (savedForm.entity_type === 'supplier') {
            const { data: supplier } = await supabase.from('suppliers').select('balance').eq('id', savedForm.entity_id).single();
            if (supplier) {
              const newBalance = savedForm.type === 'expense'
                ? Number(supplier.balance) - amount
                : Number(supplier.balance) + amount;
              await supabase.from('suppliers').update({ balance: newBalance }).eq('id', savedForm.entity_id);
            }
          } else if (savedForm.entity_type === 'partner') {
            const { data: partner } = await supabase.from('partners').select('balance').eq('id', savedForm.entity_id).single();
            if (partner) {
              const newBalance = savedForm.type === 'income'
                ? Number(partner.balance) + amount
                : Number(partner.balance) - amount;
              await supabase.from('partners').update({ balance: newBalance }).eq('id', savedForm.entity_id);
            }
          } else if (savedForm.entity_type === 'employee') {
            const { data: employee } = await supabase.from('employees').select('balance').eq('id', savedForm.entity_id).single();
            if (employee) {
              const newBalance = savedForm.type === 'expense'
                ? Number(employee.balance) + amount
                : Number(employee.balance) - amount;
              await supabase.from('employees').update({ balance: newBalance }).eq('id', savedForm.entity_id);
            }
          }
        }
      }
    })();

    toast.promise(promise, {
      loading: savedEditing ? 'جاري التعديل...' : 'جاري حفظ السند...',
      success: () => {
        queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        return savedEditing ? 'تم تعديل السند بنجاح' : 'تم حفظ السند بنجاح';
      },
      error: 'حدث خطأ أثناء حفظ السند'
    });
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingTransfer) return;
    
    if (transferForm.from_account === transferForm.to_account) {
      toast.error('لا يمكن التحويل لنفس الحساب');
      return;
    }

    const amount = Number(transferForm.amount);
    if (amount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    setIsSavingTransfer(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;

      let transferId = crypto.randomUUID(); // Unique ID to link both sides of transfer

      const expTx = {
        tenant_id: userId,
        type: 'expense',
        amount: amount,
        payment_method: transferForm.from_account,
        reference_type: 'transfer_out',
        reference_id: transferId,
        description: `تحويل إلى ${transferForm.to_account}` + (transferForm.notes ? ` - ${transferForm.notes}` : ''),
        date: new Date().toISOString().split('T')[0],
        created_by: userId,
        entity_type: 'general'
      };

      const incTx = {
        tenant_id: userId,
        type: 'income',
        amount: amount,
        payment_method: transferForm.to_account,
        reference_type: 'transfer_in',
        reference_id: transferId,
        description: `تحويل من ${transferForm.from_account}` + (transferForm.notes ? ` - ${transferForm.notes}` : ''),
        date: new Date().toISOString().split('T')[0],
        created_by: userId,
        entity_type: 'general'
      };

      const { error } = await supabase.from('transactions').insert([expTx, incTx]);
      if (error) throw error;

      setIsTransferModalOpen(false);
      setTransferForm({ from_account: 'cash', to_account: 'bankily', amount: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['finance', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('تم التحويل بنجاح');
    } catch (error: any) {
      console.error('Error transferring:', error);
      toast.error('حدث خطأ أثناء التحويل: ' + error.message);
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPartner) return;
    setIsSavingPartner(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: tenantIdData } = await supabase.rpc('get_current_tenant_id');
      const userId = tenantIdData || sessionData.session?.user.id;
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase.from('partners').insert([{
        tenant_id: userId,
        name: partnerForm.name,
        phone: partnerForm.phone,
        share_percentage: Number(partnerForm.share_percentage) || 0,
        balance: 0
      }]);

      if (error) throw error;

      setIsPartnerModalOpen(false);
      setPartnerForm({ name: '', phone: '', share_percentage: '' });
      
      toast.success('تم إضافة الشريك بنجاح');
    } catch (error: any) {
      console.error('Error saving partner:', error);
      toast.error('حدث خطأ أثناء حفظ الشريك: ' + error.message);
    } finally {
      setIsSavingPartner(false);
    }
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الشريك؟')) return;
    try {
      const { error } = await supabase.from('partners').delete().eq('id', id);
      if (error) throw error;
      
    } catch (error) {
      console.error('Error deleting partner:', error);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleDownloadPartnerPDF = async () => {
    if (!selectedPartnerForLedger) return;
    setIsExportingPartnerPDF(true);
    try {
      const partnerTxs = transactions.filter(t => t.entity_type === 'partner' && t.entity_id === selectedPartnerForLedger.id);
      const totalIncome = partnerTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalExpense = partnerTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      await generatePartnerStatementPDF(
        settings,
        {
          partner: selectedPartnerForLedger,
          transactions: partnerTxs.map(t => ({
            ...t,
            paymentMethodName: getPaymentMethodName(t.payment_method)
          })),
          totalIncome,
          totalExpense,
          dateGenerated: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        },
        `كشف_حساب_الشريك_${(selectedPartnerForLedger.name || 'شريك').replace(/\s+/g, '_')}`
      );
      toast.success('تم تحميل كشف حساب الشريك بنجاح');
    } catch (err: any) {
      console.error('Failed to export partner statement PDF:', err);
      toast.error('حدث خطأ أثناء تحميل كشف الحساب: ' + (err?.message || ''));
    } finally {
      setIsExportingPartnerPDF(false);
    }
  };

  const getPaymentMethodName = (method: string) => {
    const found = paymentMethodsList.find(pm => pm.method_id === method);
    return found ? found.name : method;
  };

  const getEntityName = (type: string, id: string) => {
    if (!type || !id || type === 'general') return '-';
    const entityList = entities[type as keyof typeof entities];
    if (!entityList) return '-';
    const entity = entityList.find(e => e.id === id);
    return entity ? entity.name : '-';
  };

  const getEntityTypeName = (type: string) => {
    const types: Record<string, string> = {
      customer: 'عميل',
      supplier: 'مورد',
      employee: 'موظف',
      partner: 'شريك',
      general: 'عام'
    };
    return types[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المالية</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'partners' && (
            <button
              onClick={() => setIsPartnerModalOpen(true)}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة شريك</span>
            </button>
          )}
          <button
            onClick={() => setIsVoucherModalOpen(true)}
            className="bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-brand-primary/20"
          >
            <Plus className="w-5 h-5" />
            <span>سند جديد (قبض/صرف)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 space-x-reverse border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'transactions' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <FileText className="w-4 h-4" />
          المعاملات المالية
        </button>
        <button
          onClick={() => setActiveTab('partners')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'partners' 
              ? "border-brand-primary text-brand-primary" 
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          الشركاء
        </button>
      </div>

      {activeTab === 'transactions' ? (
        <>
          {/* ... Transactions tab ... */}
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">إجمالي الدخل</h3>
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.income.toFixed(2)} {settings.currency}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">إجمالي المصروفات</h3>
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{summary.expense.toFixed(2)} {settings.currency}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 dark:text-gray-400 font-medium">الرصيد الصافي</h3>
            <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-brand-primary" />
            </div>
          </div>
          <p className={`text-3xl font-bold ${summary.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {summary.balance.toFixed(2)} {settings.currency}
          </p>
        </div>
      </div>

      {/* Payment Methods Distribution */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-8 mb-4 gap-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">توزيع الأرصدة (طرق الدفع)</h2>
        <div className="flex flex-wrap items-center gap-2">
          {userRole === 'admin' && (
            <button
              onClick={() => setIsCapitalModalOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              إضافة سيولة/رأس مال
            </button>
          )}
          {userRole === 'admin' && (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Wallet className="w-4 h-4" />
              إضافة محفظة
            </button>
          )}
          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <ArrowRightLeft className="w-4 h-4" />
            تحويل بين المحافظ
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {paymentMethodsList.map(method => {
          const iconComponents: Record<string, React.ElementType> = {
            Wallet,
            Building,
            CreditCard,
            Briefcase,
            DollarSign
          };
          const Icon = iconComponents[method.icon] || Wallet;
          
          return (
            <div key={method.id || method.method_id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className={`w-12 h-12 rounded-full ${method.bg || 'bg-brand-primary/10'} flex items-center justify-center mb-3`}>
                <Icon className={`w-6 h-6 ${method.color || 'text-brand-primary'}`} />
              </div>
              <h3 className="text-gray-500 dark:text-gray-400 font-medium text-sm mb-1">{method.name}</h3>
              <p className={`text-xl font-bold ${paymentMethodsSummary[method.method_id] >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
                {(paymentMethodsSummary[method.method_id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {settings.currency}
              </p>
            </div>
          );
        })}
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">سجل المعاملات والسندات</h2>
          <button
            onClick={() => exportTableToPDF('transactions-table', 'سجل_المعاملات')}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>تحميل PDF</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table id="transactions-table" className="w-full text-right">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">التاريخ</th>
                <th className="px-6 py-4 font-medium">النوع</th>
                <th className="px-6 py-4 font-medium">الجهة</th>
                <th className="px-6 py-4 font-medium">طريقة الدفع</th>
                <th className="px-6 py-4 font-medium">الوصف</th>
                <th className="px-6 py-4 font-medium">المبلغ</th>
                <th className="px-6 py-4 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    لا توجد معاملات مسجلة
                  </td>
                </tr>
              ) : (
                currentTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        {new Date(t.date).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {t.payment_method === 'debt_record' || t.reference_type === 'custom_order_debt' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50">
                          تراكم دين
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          t.type === 'income' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {t.type === 'income' ? 'قبض (دخل)' : 'صرف (مصروف)'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {t.entity_type && t.entity_type !== 'general' ? (
                        <div>
                          <span className="text-xs text-gray-500 block">{getEntityTypeName(t.entity_type)}</span>
                          <span className="font-medium">{getEntityName(t.entity_type, t.entity_id)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500">عام</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {t.payment_method === 'debt_record' || t.reference_type === 'custom_order_debt' ? 'ذمة مالية' : getPaymentMethodName(t.payment_method || 'cash')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                      {t.description || '-'}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold ${
                      t.payment_method === 'debt_record' || t.reference_type === 'custom_order_debt' ? 'text-orange-600 dark:text-orange-400' :
                      t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {t.payment_method === 'debt_record' || t.reference_type === 'custom_order_debt' ? '' : (t.type === 'income' ? '+' : '-')}{Number(t.amount).toFixed(2)} {settings.currency}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {(!t.reference_type || t.reference_type === 'receipt_voucher' || t.reference_type === 'payment_voucher') && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditTransaction(t)}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            title="تعديل"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteClick(t)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            title="حذف"
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                عرض {indexOfFirstItem + 1} إلى {Math.min(indexOfLastItem, transactions.length)} من {transactions.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  السابق
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(currentPage - p) <= 2)
                    .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i-1] !== p - 1 && <span className="px-2 text-gray-400">...</span>}
                      <button
                        onClick={() => handlePageChange(p)}
                        className={`w-8 h-8 flex items-center justify-center text-sm font-medium rounded-lg ${
                          currentPage === p
                            ? 'bg-brand-primary text-white'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      ) : (
        /* Partners Tab Content */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {entities.partner.map(partner => {
            const partnerTransactions = transactions.filter(t => t.entity_type === 'partner' && t.entity_id === partner.id);
            const capital = partnerTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
            const withdrawals = partnerTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

            return (
              <div key={partner.id} className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <button
                    onClick={() => handleDeletePartner(partner.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{partner.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{partner.phone || 'بدون رقم هاتف'}</p>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">نسبة الشراكة:</span>
                    <span className="font-bold text-brand-primary">{partner.share_percentage}%</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">رأس المال المبني:</span>
                    <span className="font-bold text-green-600">
                      {capital.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">مجموع المسحوبات:</span>
                    <span className="font-bold text-red-600">
                      {withdrawals.toLocaleString()} {settings.currency}
                    </span>
                  </div>
                  <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <span className="text-gray-500 text-sm">الرصيد/حقوق الملكية:</span>
                    <span className={`font-bold ${Number(partner.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(partner.balance).toLocaleString()} {settings.currency}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPartnerForLedger(partner)}
                  className="w-full mt-5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700"
                >
                  <FileText className="w-5 h-5" />
                  <span>كشف حساب الشريك</span>
                </button>
              </div>
            );
          })}
          {entities.partner.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 font-medium bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              لا يوجد شركاء مسجلين.
            </div>
          )}
        </div>
      )}

      {/* Voucher Modal */}
      {isVoucherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-brand-primary" />
                {editingTransaction ? 'تعديل السند' : 'سند جديد'}
              </h2>
              <button onClick={() => { setIsVoucherModalOpen(false); setEditingTransaction(null); }} className="text-gray-400 hover:text-gray-600">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSaveVoucher} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setVoucherForm({ ...voucherForm, type: 'income' })}
                  className={`p-4 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition-all ${
                    voucherForm.type === 'income' 
                      ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  <TrendingUp className="w-6 h-6" />
                  سند قبض (استلام)
                </button>
                <button
                  type="button"
                  onClick={() => setVoucherForm({ ...voucherForm, type: 'expense' })}
                  className={`p-4 rounded-xl border-2 font-bold flex flex-col items-center gap-2 transition-all ${
                    voucherForm.type === 'expense' 
                      ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' 
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  <TrendingDown className="w-6 h-6" />
                  سند صرف (دفع)
                </button>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الجهة</label>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <select
                    value={voucherForm.entity_type}
                    onChange={(e) => setVoucherForm({ ...voucherForm, entity_type: e.target.value, entity_id: '', order_id: '' })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                  >
                    <option value="general">عام (بدون جهة)</option>
                    <option value="customer">عميل</option>
                    <option value="supplier">مورد</option>
                    <option value="employee">موظف</option>
                    <option value="partner">شريك</option>
                  </select>

                  {voucherForm.entity_type !== 'general' && (
                    <SearchableSelect
                      required
                      value={voucherForm.entity_id}
                      onChange={val => setVoucherForm({ ...voucherForm, entity_id: val, order_id: '' })}
                      options={[{value: '', label: `اختر ${getEntityTypeName(voucherForm.entity_type)}...`}, ...(entities[voucherForm.entity_type]?.map((entity: any) => ({ value: entity.id, label: entity.name })) || [])]}
                      placeholder={`ابحث عن ${getEntityTypeName(voucherForm.entity_type)}...`}
                      className="bg-gray-50 dark:bg-gray-800"
                    />
                  )}
                </div>

                {voucherForm.entity_type === 'customer' && voucherForm.type === 'income' && customerOrders.length > 0 && (
                  <div className="mb-3">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      ربط بطلب تفصيل (اختياري)
                    </label>
                    <select
                      value={voucherForm.order_id}
                      onChange={(e) => setVoucherForm({ ...voucherForm, order_id: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                    >
                      <option value="">سداد عام (بدون ربط)</option>
                      {customerOrders.map((order: any) => (
                        <option key={order.id} value={order.id}>
                          طلب #{order.id.split('-')[0]} (المتبقي: {Number(order.total_price) - Number(order.paid_amount || order.advance_payment)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">تاريخ السند</label>
                  <input
                    type="date"
                    required
                    value={voucherForm.date}
                    onChange={(e) => setVoucherForm({ ...voucherForm, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">طريقة الدفع/القبض</label>
                  <select
                    value={voucherForm.payment_method}
                    onChange={(e) => setVoucherForm({ ...voucherForm, payment_method: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                  >
                    {paymentMethodsList.map(method => (
                      <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={voucherForm.amount}
                    onChange={(e) => setVoucherForm({ ...voucherForm, amount: e.target.value })}
                    className="w-full px-4 py-3 pl-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none font-bold"
                    placeholder="0.00"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">{settings.currency}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">البيان / الوصف</label>
                <input
                  type="text"
                  required
                  value={voucherForm.description}
                  onChange={(e) => setVoucherForm({ ...voucherForm, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="مثال: دفعة من الحساب، سداد فاتورة..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingVoucher}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingVoucher ? <Loader2 className="w-5 h-5 animate-spin" /> : (editingTransaction ? 'حفظ التعديلات' : 'حفظ السند')}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsVoucherModalOpen(false); setEditingTransaction(null); }}
                  className="px-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تحويل رصيد</h2>
            </div>
            <form onSubmit={handleTransfer} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">من حساب</label>
                  <select
                    value={transferForm.from_account}
                    onChange={(e) => setTransferForm({ ...transferForm, from_account: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  >
                    {paymentMethodsList.map(method => (
                      <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">إلى حساب</label>
                  <select
                    value={transferForm.to_account}
                    onChange={(e) => setTransferForm({ ...transferForm, to_account: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  >
                    {paymentMethodsList.map(method => (
                      <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="w-full px-4 py-3 pl-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none font-bold"
                    placeholder="0.00"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">{settings.currency}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظة</label>
                <input
                  type="text"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="ملاحظة اختيارية"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingTransfer}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                >
                  {isSavingTransfer ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تحويل'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl font-bold transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partner Modal */}
      {isPartnerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">إضافة شريك جديد</h2>
            </div>
            <form onSubmit={handleSavePartner} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم الشريك</label>
                <input
                  type="text"
                  required
                  value={partnerForm.name}
                  onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="اسم الشريك الكامل"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">رقم الهاتف</label>
                <input
                  type="text"
                  value={partnerForm.phone}
                  onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="رقم الهاتف"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">نسبة الشراكة (%)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={partnerForm.share_percentage}
                  onChange={(e) => setPartnerForm({ ...partnerForm, share_percentage: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none transition-all font-medium"
                  placeholder="0"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingPartner}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white px-4 py-3 rounded-xl transition-colors font-bold shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSavingPartner ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ الشريك'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartnerModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl transition-colors font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partner Ledger Modal */}
      {selectedPartnerForLedger && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20 shrink-0 gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center shrink-0">
                  <Briefcase className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">كشف حساب الشريك: {selectedPartnerForLedger.name}</h2>
                  <p className="text-sm font-medium text-gray-500 mt-1">الرصيد الحالي المستحق: {Number(selectedPartnerForLedger.balance).toLocaleString()} {settings.currency}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isExportingPartnerPDF}
                  onClick={handleDownloadPartnerPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                  title="تحميل كشف الحساب بصيغة PDF وإرساله للشريك"
                >
                  {isExportingPartnerPDF ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  <span>تحميل PDF</span>
                </button>
                <button 
                  onClick={() => setSelectedPartnerForLedger(null)} 
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="إغلاق"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900/50">
              {transactions.filter(t => t.entity_type === 'partner' && t.entity_id === selectedPartnerForLedger.id).length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-medium">لا توجد معاملات مسجلة لهذا الشريك.</div>
              ) : (
                <div className="space-y-4">
                  {transactions.filter(t => t.entity_type === 'partner' && t.entity_id === selectedPartnerForLedger.id).map((t) => (
                    <div key={t.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden transition-all hover:border-gray-300 dark:hover:border-gray-600">
                      <div className={`absolute right-0 top-0 bottom-0 w-1 ${t.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            t.type === 'income' 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {t.type === 'income' ? 'إيداع/رأس مال' : 'سحب/صرف'}
                          </span>
                          <span className="text-sm font-medium text-gray-500">
                            {new Date(t.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-gray-900 dark:text-white font-medium">{t.description || 'بدون وصف'}</p>
                      </div>
                      <div className="text-left sm:shrink-0 w-full sm:w-auto flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                        <span className={`text-xl sm:text-2xl font-black ${
                          t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString()}
                        </span>
                        <span className="text-sm text-gray-500 mt-1">{getPaymentMethodName(t.payment_method)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">تأكيد الحذف</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 font-medium">
                هل أنت متأكد من حذف هذه المعاملة ({transactionToDelete.amount} {settings.currency})؟ 
                سيتم التراجع عن تأثيرها على الأرصدة.
              </p>
              <div className="mt-8 flex items-center justify-end gap-3 flex-row-reverse">
                <button
                  type="button"
                  onClick={confirmDeleteTransaction}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                >
                  نعم، احذف المعاملة
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionToDelete(null)}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capital Injection Modal */}
      {isCapitalModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Plus className="w-6 h-6 text-brand-primary" />
                إضافة رأس مال / سيولة
              </h2>
              <button onClick={() => setIsCapitalModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSaveCapital} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">المبلغ</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={capitalForm.amount}
                  onChange={e => setCapitalForm({...capitalForm, amount: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder={`أدخل المبلغ (${settings.currency})`}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">إلى المحفظة</label>
                <select
                  value={capitalForm.payment_method}
                  onChange={e => setCapitalForm({...capitalForm, payment_method: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  {paymentMethodsList.map(method => (
                    <option key={method.id || method.method_id} value={method.method_id}>{method.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={capitalForm.notes}
                  onChange={e => setCapitalForm({...capitalForm, notes: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="مثال: من الشريك أحمد"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingCapital}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {isSavingCapital ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCapitalModalOpen(false)}
                  className="px-6 py-3.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Wallet Modal */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-6 h-6 text-brand-primary" />
                إضافة محفظة جديدة
              </h2>
              <button onClick={() => setIsWalletModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSaveWallet} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اسم المحفظة</label>
                <input
                  type="text"
                  required
                  value={walletForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    const method_id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') || `wallet_${Date.now()}`;
                    setWalletForm({...walletForm, name, method_id});
                  }}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                  placeholder="مثال: حساب البنك المركزي"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">نوع المحفظة</label>
                <select
                  value={walletForm.type}
                  onChange={e => setWalletForm({...walletForm, type: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-primary outline-none"
                >
                  <option value="bank">حساب بنكي</option>
                  <option value="cash">صندوق نقدي</option>
                  <option value="mobile_money">تطبيق دفع</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">اللون المميز</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { c: 'text-brand-primary', bg: 'bg-brand-primary/10' },
                    { c: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
                    { c: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' },
                    { c: 'text-rose-600', bg: 'bg-rose-100 dark:bg-rose-900/30' },
                    { c: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
                    { c: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' },
                    { c: 'text-cyan-600', bg: 'bg-cyan-100 dark:bg-cyan-900/30' }
                  ].map(scheme => (
                    <button
                      key={scheme.c}
                      type="button"
                      onClick={() => setWalletForm({...walletForm, color: scheme.c, bg: scheme.bg})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${walletForm.color === scheme.c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'} ${scheme.bg}`}
                    ></button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">الأيقونة</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'Building', label: 'مبنى' },
                    { id: 'Wallet', label: 'محفظة' },
                    { id: 'CreditCard', label: 'بطاقة' },
                    { id: 'DollarSign', label: 'عملة' },
                    { id: 'Briefcase', label: 'حقيبة' }
                  ].map(i => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setWalletForm({...walletForm, icon: i.id})}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${walletForm.icon === i.id ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : 'bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'}`}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={isSavingWallet}
                  className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-3.5 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {isSavingWallet ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إضافة المحفظة'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWalletModalOpen(false)}
                  className="px-6 py-3.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
