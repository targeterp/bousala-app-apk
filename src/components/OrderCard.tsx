import toast from 'react-hot-toast';
import React, { memo, useState } from 'react';
import { Scissors, Users, Clock, Edit2, Trash2, CheckCircle2, X, MessageCircle, FileText, Printer, Loader2 } from 'lucide-react';
import { cn } from '../utils';
import { generateInvoicePDF, printInvoice } from '../utils/pdfGenerator';

interface OrderCardProps {
  order: any;
  status: string;
  settings: any;
  onEdit: (order: any) => void;
  onDelete: (orderId: string) => void;
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  onWhatsApp: (phone: string, customerName: string, remaining: number) => void;
  onUpdateReceivedQuantity?: (orderId: string, itemId: string, newReceivedQty: number, metaNotes: any) => Promise<void>;
}

const parseArabicNumber = (str: string | number | undefined | null): number => {
  if (str === undefined || str === null) return 0;
  if (typeof str === 'number') return str;
  const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const englishNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let parsedStr = str.toString();
  for (let i = 0; i < 10; i++) {
    const regex = new RegExp(arabicNumbers[i], 'g');
    parsedStr = parsedStr.replace(regex, englishNumbers[i]);
  }
  return Number(parsedStr) || 0;
};

export const OrderCard = memo(({ order, status, settings, onEdit, onDelete, onUpdateStatus, onWhatsApp, onUpdateReceivedQuantity }: OrderCardProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const remaining = parseArabicNumber(order.total_price) - parseArabicNumber(order.advance_payment);
  const item = order.custom_order_items?.[0];

  const getInvoiceData = () => {
    return {
      title: 'فاتورة تفصيل',
      invoiceNumber: order.id.split('-')[0].toUpperCase(),
      date: new Date(order.order_date || order.created_at).toLocaleDateString('ar-EG'),
      customerName: order.customers?.name || 'بدون مساهم/عميل',
      customerPhone: order.customers?.phone || '',
      items: [
        {
          description: `تفصيل: ${item?.target?.name || 'عباءة/ثوب'} - قماش: ${item?.fabric?.name || 'غير محدد'}`,
          quantity: 1,
          price: parseArabicNumber(order.total_price).toLocaleString() + ' ' + settings.currency,
          total: parseArabicNumber(order.total_price).toLocaleString() + ' ' + settings.currency,
        }
      ],
      summary: [
        { label: 'الإجمالي', value: parseArabicNumber(order.total_price).toLocaleString() + ' ' + settings.currency },
        { label: 'الدفعة المقدمة', value: parseArabicNumber(order.advance_payment).toLocaleString() + ' ' + settings.currency },
        { label: 'المتبقي (الديون)', value: remaining.toLocaleString() + ' ' + settings.currency, isGrandTotal: true }
      ]
    };
  };

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await generateInvoicePDF(settings, getInvoiceData(), `Order-${order.id.split('-')[0]}`);
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء إنشاء PDF: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = async () => {
    setIsGenerating(true);
    try {
      await printInvoice(settings, getInvoiceData());
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء الطباعة: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setIsGenerating(false);
    }
  };

  let metaNotes: any = {};
  if (item?.notes && item.notes.startsWith('{')) {
    try {
      metaNotes = JSON.parse(item.notes);
    } catch (e) {}
  }
  
  const textNotes = metaNotes.notes !== undefined ? metaNotes.notes : (item?.notes && !item.notes.startsWith('{') ? item.notes : '');

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <span className="font-bold text-gray-900 dark:text-white text-sm truncate">
          {order.customers?.name || 'بدون عميل'} {(item?.quantity || metaNotes.quantity) && (item?.quantity > 1 || metaNotes.quantity > 1) ? `(الكمية: ${item?.quantity || metaNotes.quantity} قطع)` : ''}
        </span>
        <span className="text-xs text-gray-500 font-mono">
          #{order.id.split('-')[0]}
        </span>
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-brand-primary font-bold">
          <span className="truncate">{item?.target?.name || 'منتج تفصيل'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Scissors className="w-3.5 h-3.5" />
          <span className="truncate">{item?.fabric?.name} ({item?.fabric_meters}م)</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <Users className="w-3.5 h-3.5" />
          <span className="truncate">الخياط: {item?.tailors?.name}</span>
        </div>
        {order.expected_delivery_date && (
          <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>التسليم: {new Date(order.expected_delivery_date).toLocaleDateString('ar-EG')}</span>
          </div>
        )}
        {textNotes && (
          <div className="pt-2">
            <button 
              onClick={() => setShowNotes(!showNotes)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-brand-primary transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {showNotes ? 'إخفاء الملاحظات' : 'عرض الملاحظات'}
            </button>
            {showNotes && (
              <div className="mt-2 p-3 bg-brand-light/50 dark:bg-brand-primary/10 rounded-xl text-xs text-brand-dark dark:text-brand-primary leading-relaxed border border-brand-primary/10 whitespace-pre-wrap font-medium">
                {textNotes}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700 mb-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500">المتبقي</span>
          <span className={cn(
            "font-bold text-sm",
            remaining > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
          )}>
            {remaining.toLocaleString()} {settings.currency}
          </span>
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] text-gray-500">الإجمالي</span>
          <span className="font-bold text-gray-900 dark:text-white text-sm">
            {parseArabicNumber(order.total_price).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button 
          onClick={handlePrint}
          disabled={isGenerating}
          className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
          title="طباعة الفاتورة"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        </button>
        <button 
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
          title="تحميل PDF"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        </button>
        
        {status !== 'cancelled' && (
          <>
            <button 
              onClick={() => onEdit(order)}
              className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 rounded-lg transition-colors"
              title="تعديل"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onDelete(order.id)}
              className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-lg transition-colors"
              title="حذف وإلغاء الطلب"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        {status === 'pending' && (
          <button onClick={() => onUpdateStatus(order.id, 'tailoring')} className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 py-1.5 rounded-lg text-xs font-bold transition-colors">
            بدء الخياطة
          </button>
        )}
        {status === 'tailoring' && (
          <button onClick={() => onUpdateStatus(order.id, 'ready')} className="flex-1 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 py-1.5 rounded-lg text-xs font-bold transition-colors">
            جاهز للاستلام
          </button>
        )}
        {status === 'ready' && (
          <>
            {!order.customer_id && (
              <button onClick={() => onUpdateStatus(order.id, 'delivered')} className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 py-1.5 rounded-lg text-xs font-bold transition-colors">
                تسليم
              </button>
            )}
            {order.customers?.phone && (
              <button onClick={() => onWhatsApp(order.customers.phone, order.customers.name, remaining)} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                <MessageCircle className="w-4 h-4" />
              </button>
            )}
          </>
        )}
        {status === 'delivered' && (
          <div className="flex-1 flex flex-col gap-2">
            {!order.customer_id && onUpdateReceivedQuantity ? (
              <div className="flex flex-col gap-1 w-full p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                <span className="text-[10px] text-gray-500 text-center font-bold">الكمية المستلمة</span>
                <div className="flex items-center justify-between gap-2">
                  <button 
                    onClick={() => {
                      const currentQty = metaNotes?.received_quantity || 0;
                      if (currentQty > 0) {
                        onUpdateReceivedQuantity(order.id, item?.id, currentQty - 1, metaNotes);
                      }
                    }}
                    className="w-6 h-6 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    -
                  </button>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {metaNotes?.received_quantity || 0} / {metaNotes?.quantity || item?.quantity || 0}
                  </span>
                  <button 
                    onClick={() => {
                      const currentQty = metaNotes?.received_quantity || 0;
                      const maxQty = metaNotes?.quantity || item?.quantity || 0;
                      if (currentQty < maxQty) {
                        onUpdateReceivedQuantity(order.id, item?.id, currentQty + 1, metaNotes);
                      }
                    }}
                    className="w-6 h-6 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400 py-1 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                تم التسليم
              </div>
            )}
          </div>
        )}
        {status === 'cancelled' && (
          <div className="flex-1 flex items-center justify-center gap-1 text-red-600 dark:text-red-400 py-1.5 text-xs font-bold">
            <X className="w-4 h-4" />
            ملغي
          </div>
        )}
      </div>
    </div>
  );
});
