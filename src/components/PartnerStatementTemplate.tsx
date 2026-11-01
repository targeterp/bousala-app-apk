import React from 'react';
import { AppSettings } from '../contexts/SettingsContext';

export type PartnerStatementData = {
  partner: {
    id: string;
    name: string;
    balance: number | string;
    phone?: string;
  };
  transactions: Array<{
    id: string;
    date: string;
    type: 'income' | 'expense' | string;
    amount: number | string;
    payment_method?: string;
    paymentMethodName?: string;
    description?: string;
  }>;
  totalIncome: number;
  totalExpense: number;
  dateGenerated: string;
};

type PartnerStatementTemplateProps = {
  settings: AppSettings;
  data: PartnerStatementData;
};

export const PartnerStatementTemplate: React.FC<PartnerStatementTemplateProps> = ({
  settings,
  data
}) => {
  const { partner, transactions, totalIncome, totalExpense, dateGenerated } = data;
  const currentBalance = Number(partner.balance || 0);
  const currency = settings.currency || 'MRU';

  return (
    <div
      id="partner-statement-template"
      style={{
        width: '794px',
        backgroundColor: '#ffffff',
        color: '#111827',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      className="p-8 min-h-[1123px] mx-auto box-border flex flex-col justify-between"
      dir="rtl"
    >
      <div>
        {/* Header */}
        <div className="flex justify-between items-start pb-6 mb-6" style={{ borderBottom: '2px solid #e5e7eb' }}>
          <div className="flex flex-col gap-1.5">
            {settings.storeLogo ? (
              <img src={settings.storeLogo} alt="Store Logo" className="h-16 w-auto object-contain mb-1" />
            ) : (
              <h1 className="text-2xl font-black" style={{ color: settings.themeColor || '#00A372' }}>
                {settings.receiptHeader || 'نظام إدارة المبيعات والحسابات'}
              </h1>
            )}
            {settings.storeAddress && (
              <p className="text-xs" style={{ color: '#4b5563' }}>{settings.storeAddress}</p>
            )}
            {settings.storePhone && (
              <p className="text-xs" style={{ color: '#4b5563' }} dir="ltr">{settings.storePhone}</p>
            )}
            {settings.taxNumber && (
              <p className="text-xs" style={{ color: '#4b5563' }}>الرقم الضريبي: {settings.taxNumber}</p>
            )}
          </div>

          <div className="text-left flex flex-col gap-1 items-end">
            <span
              className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-1"
              style={{ backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}
            >
              كشف حساب رسمي
            </span>
            <h2 className="text-2xl font-black" style={{ color: '#111827' }}>كشف حساب شريك</h2>
            <p className="text-xs font-bold" style={{ color: '#4b5563' }}>
              تاريخ التقرير: <span style={{ color: '#111827' }}>{dateGenerated}</span>
            </p>
          </div>
        </div>

        {/* Partner Information Card */}
        <div className="mb-6 rounded-2xl p-5" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <span className="text-xs font-bold" style={{ color: '#64748b' }}>بيانات الشريك:</span>
              <h3 className="text-xl font-black mt-0.5" style={{ color: '#0f172a' }}>
                {partner.name}
              </h3>
              {partner.phone && (
                <p className="text-xs font-mono mt-1" style={{ color: '#475569' }} dir="ltr">
                  {partner.phone}
                </p>
              )}
            </div>

            <div className="text-left">
              <span className="text-xs font-bold" style={{ color: '#64748b' }}>حالة الحساب:</span>
              <p className="text-sm font-bold mt-0.5" style={{ color: '#0f172a' }}>
                {currentBalance > 0
                  ? 'رصيد دائن للشريك (مستحق له)'
                  : currentBalance < 0
                  ? 'رصيد مدين على الشريك (مستحق عليه)'
                  : 'الحساب متوازن (0.00)'}
              </p>
            </div>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div
            className="rounded-2xl p-4 text-center"
            style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}
          >
            <p className="text-xs font-bold mb-1" style={{ color: '#15803d' }}>إجمالي الإيداعات / رأس المال</p>
            <p className="text-lg font-black" style={{ color: '#166534' }}>
              +{totalIncome.toLocaleString()} <span className="text-xs font-bold">{currency}</span>
            </p>
          </div>

          <div
            className="rounded-2xl p-4 text-center"
            style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
          >
            <p className="text-xs font-bold mb-1" style={{ color: '#b91c1c' }}>إجمالي السحوبات / المصروفات</p>
            <p className="text-lg font-black" style={{ color: '#991b1b' }}>
              -{totalExpense.toLocaleString()} <span className="text-xs font-bold">{currency}</span>
            </p>
          </div>

          <div
            className="rounded-2xl p-4 text-center"
            style={{
              backgroundColor: currentBalance >= 0 ? '#eff6ff' : '#fffbeb',
              border: `1px solid ${currentBalance >= 0 ? '#bfdbfe' : '#fde68a'}`
            }}
          >
            <p className="text-xs font-bold mb-1" style={{ color: currentBalance >= 0 ? '#1d4ed8' : '#b45309' }}>
              الرصيد الحالي المستحق
            </p>
            <p className="text-xl font-black" style={{ color: currentBalance >= 0 ? '#1e40af' : '#92400e' }}>
              {currentBalance.toLocaleString()} <span className="text-xs font-bold">{currency}</span>
            </p>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-bold" style={{ color: '#1e293b' }}>
              تفاصيل حركة المعاملات ({transactions.length})
            </h4>
          </div>

          <table className="w-full text-right" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th className="py-2.5 px-3 text-xs font-bold text-right" style={{ color: '#334155' }}>#</th>
                <th className="py-2.5 px-3 text-xs font-bold text-right" style={{ color: '#334155' }}>التاريخ</th>
                <th className="py-2.5 px-3 text-xs font-bold text-center" style={{ color: '#334155' }}>النوع</th>
                <th className="py-2.5 px-3 text-xs font-bold text-right" style={{ color: '#334155' }}>البيان / الوصف</th>
                <th className="py-2.5 px-3 text-xs font-bold text-center" style={{ color: '#334155' }}>طريقة الدفع</th>
                <th className="py-2.5 px-3 text-xs font-bold text-left" style={{ color: '#334155' }}>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium" style={{ color: '#64748b' }}>
                    لا توجد معاملات مسجلة لهذا الشريك حتى الآن.
                  </td>
                </tr>
              ) : (
                transactions.map((tx, idx) => {
                  const isIncome = tx.type === 'income';
                  return (
                    <tr
                      key={tx.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc'
                      }}
                    >
                      <td className="py-3 px-3 text-xs font-mono text-right" style={{ color: '#64748b' }}>
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 text-xs font-medium text-right" style={{ color: '#334155' }}>
                        {new Date(tx.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-bold inline-block"
                          style={{
                            backgroundColor: isIncome ? '#dcfce7' : '#fee2e2',
                            color: isIncome ? '#15803d' : '#b91c1c'
                          }}
                        >
                          {isIncome ? 'إيداع/رأس مال' : 'سحب/صرف'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs font-medium text-right" style={{ color: '#1e293b' }}>
                        {tx.description || 'بدون وصف'}
                      </td>
                      <td className="py-3 px-3 text-xs text-center" style={{ color: '#64748b' }}>
                        {tx.paymentMethodName || tx.payment_method || '-'}
                      </td>
                      <td
                        className="py-3 px-3 text-xs font-black text-left"
                        style={{ color: isIncome ? '#16a34a' : '#dc2626' }}
                      >
                        {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()} {currency}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 mt-6 text-center" style={{ borderTop: '1px solid #e2e8f0' }}>
        {settings.receiptFooter ? (
          <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>{settings.receiptFooter}</p>
        ) : (
          <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>
            تم استخراج هذا التقرير آلياً من نظام إدارة المبيعات والحسابات
          </p>
        )}
        <p className="text-[10px]" style={{ color: '#94a3b8' }}>
          الصفحة 1 من 1 • جميع المعاملات موثقة ومحسوبة حسب السجلات المحاسبية الرسمية
        </p>
      </div>
    </div>
  );
};
