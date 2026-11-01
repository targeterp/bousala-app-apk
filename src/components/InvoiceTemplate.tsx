import React from 'react';
import { AppSettings } from '../contexts/SettingsContext';

type InvoiceTemplateProps = {
  settings: AppSettings;
  title: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    description: string;
    quantity?: number | string;
    price?: number | string;
    total: number | string;
  }>;
  summary: Array<{
    label: string;
    value: number | string;
    isBold?: boolean;
    isGrandTotal?: boolean;
  }>;
};

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  settings,
  title,
  invoiceNumber,
  date,
  customerName,
  customerPhone,
  items,
  summary
}) => {
  return (
    <div id="invoice-template" style={{ width: '794px', backgroundColor: '#ffffff', color: '#111827' }} className="p-8 font-sans min-h-[1123px] mx-auto box-border" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-6" style={{ borderBottom: '2px solid #e5e7eb' }}>
        <div className="flex flex-col gap-2">
          {settings.storeLogo ? (
            <img src={settings.storeLogo} alt="Store Logo" className="h-16 w-auto object-contain" />
          ) : (
            <h1 className="text-3xl font-black" style={{ color: settings.themeColor }}>
              {settings.receiptHeader || 'فاتورة'}
            </h1>
          )}
          {settings.storeAddress && <p className="text-sm" style={{ color: '#4b5563' }}>{settings.storeAddress}</p>}
          {settings.storePhone && <p className="text-sm" style={{ color: '#4b5563' }}>{settings.storePhone}</p>}
          {settings.taxNumber && <p className="text-sm" style={{ color: '#4b5563' }}>الرقم الضريبي: {settings.taxNumber}</p>}
        </div>
        
        <div className="text-left flex flex-col gap-1 items-end">
          <h2 className="text-4xl font-black mb-2" style={{ color: '#e5e7eb' }}>{title}</h2>
          <p className="text-sm font-bold" style={{ color: '#1f2937' }}>رقم: <span className="font-mono" style={{ color: '#6b7280' }}>{invoiceNumber}</span></p>
          <p className="text-sm font-bold" style={{ color: '#1f2937' }}>التاريخ: <span style={{ color: '#6b7280' }}>{date}</span></p>
        </div>
      </div>

      {/* Bill To */}
      {(customerName || customerPhone) && (
        <div className="mb-8">
          <h3 className="text-sm font-bold mb-2 tracking-normal" style={{ color: '#6b7280' }}>بيانات العميل</h3>
          <div className="rounded-xl p-4 w-1/2" style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
            {customerName && <p className="font-bold text-lg mb-1" style={{ color: '#111827' }}>{customerName}</p>}
            {customerPhone && <p style={{ color: '#4b5563' }} dir="ltr">{customerPhone}</p>}
          </div>
        </div>
      )}

      {/* Items Table */}
      <table className="w-full mb-8">
        <thead>
          <tr style={{ borderBottom: '2px solid #111827' }}>
            <th className="py-3 px-2 text-right font-bold" style={{ color: '#111827' }}>الوصف</th>
            <th className="py-3 px-2 text-center font-bold" style={{ color: '#111827' }}>الكمية</th>
            <th className="py-3 px-2 text-center font-bold" style={{ color: '#111827' }}>السعر</th>
            <th className="py-3 px-2 text-left font-bold" style={{ color: '#111827' }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td className="py-4 px-2 text-right font-medium" style={{ color: '#1f2937' }}>{item.description}</td>
              <td className="py-4 px-2 text-center" style={{ color: '#4b5563' }}>{item.quantity || '-'}</td>
              <td className="py-4 px-2 text-center" style={{ color: '#4b5563' }}>{item.price || '-'}</td>
              <td className="py-4 px-2 text-left font-bold" style={{ color: '#111827' }}>{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="flex justify-end mb-12">
        <div className="w-1/2 rounded-xl p-4" style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
          <div className="space-y-3">
            {summary.map((row, idx) => (
              <div 
                key={idx} 
                className="flex justify-between items-center"
                style={row.isGrandTotal ? { borderTop: '2px solid #e5e7eb', marginTop: '0.5rem', paddingTop: '0.75rem' } : {}}
              >
                <span className={row.isBold || row.isGrandTotal ? 'font-bold' : ''} style={{ color: row.isBold || row.isGrandTotal ? '#111827' : '#4b5563' }}>
                  {row.label}
                </span>
                <span className={`${row.isGrandTotal ? 'font-black text-xl' : (row.isBold ? 'font-bold' : 'font-medium')}`} style={{ color: row.isGrandTotal ? settings.themeColor : '#111827' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-8 text-center" style={{ borderTop: '1px solid #e5e7eb' }}>
        {settings.receiptFooter && (
          <p className="font-medium text-lg" style={{ color: '#6b7280' }}>{settings.receiptFooter}</p>
        )}
      </div>
    </div>
  );
};
