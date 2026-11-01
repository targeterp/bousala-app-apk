import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { AppSettings } from '../contexts/SettingsContext';
import { InvoiceTemplate } from '../components/InvoiceTemplate';
import { PartnerStatementTemplate, PartnerStatementData } from '../components/PartnerStatementTemplate';

export const generateInvoicePDF = async (
  settings: AppSettings,
  invoiceData: any,
  filename: string
) => {
  return new Promise<void>(async (resolve, reject) => {
    // Create a temporary container that is visually hidden but in the document flow
    const container = document.createElement('div');
    // Place it out of view but keep it relative to the top so it renders fully
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.right = '200vw'; // Move far right off screen
    container.style.width = '794px'; // A4 width
    // Prevent it from pushing body scroll
    container.style.overflow = 'hidden';
    document.body.appendChild(container);

    const root = createRoot(container);
    
    try {
      // Render the invoice component
      root.render(
        <InvoiceTemplate 
          settings={settings}
          title={invoiceData.title}
          invoiceNumber={invoiceData.invoiceNumber}
          date={invoiceData.date}
          customerName={invoiceData.customerName}
          customerPhone={invoiceData.customerPhone}
          items={invoiceData.items}
          summary={invoiceData.summary}
        />
      );

      // Wait for React to render and images (like logo) to load
      await new Promise(r => setTimeout(r, 800));

      const element = container.querySelector('#invoice-template') as HTMLElement;
      if (!element) throw new Error('تعذر العثور على قالب الفاتورة في الصفحة.');

      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        allowTaint: true, // helps with some images
        backgroundColor: '#ffffff',
        // Provide dimensions manually to prevent 0x0 errors
        width: element.offsetWidth,
        height: element.offsetHeight,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      if (imgData === 'data:,') throw new Error('فشل التقاط صورة للفاتورة (بيانات فارغة).');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${filename}.pdf`);
      resolve();
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      reject(error);
    } finally {
      // Clean up
      setTimeout(() => {
        root.unmount();
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }, 200);
    }
  });
};

export const printInvoice = async (
  settings: AppSettings,
  invoiceData: any
) => {
  return new Promise<void>(async (resolve, reject) => {
    const container = document.createElement('div');
    container.id = 'print-container';
    document.body.appendChild(container);

    const root = createRoot(container);
    
    try {
      root.render(
        <InvoiceTemplate 
          settings={settings}
          title={invoiceData.title}
          invoiceNumber={invoiceData.invoiceNumber}
          date={invoiceData.date}
          customerName={invoiceData.customerName}
          customerPhone={invoiceData.customerPhone}
          items={invoiceData.items}
          summary={invoiceData.summary}
        />
      );

      await new Promise(r => setTimeout(r, 800));

      window.print();
      resolve();
    } catch (error: any) {
      console.error('Error printing:', error);
      reject(error);
    } finally {
      setTimeout(() => {
        root.unmount();
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }, 1500);
    }
  });
};

export const generatePartnerStatementPDF = async (
  settings: AppSettings,
  data: PartnerStatementData,
  filename: string
) => {
  return new Promise<void>(async (resolve, reject) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.right = '200vw'; // Move off-screen
    container.style.width = '794px'; // A4 width
    container.style.overflow = 'hidden';
    document.body.appendChild(container);

    const root = createRoot(container);

    try {
      root.render(
        <PartnerStatementTemplate 
          settings={settings}
          data={data}
        />
      );

      // Wait for React to render and images (like logo) to settle
      await new Promise(r => setTimeout(r, 600));

      const element = container.querySelector('#partner-statement-template') as HTMLElement;
      if (!element) throw new Error('تعذر العثور على قالب كشف الحساب في الصفحة.');

      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: element.offsetWidth,
        height: element.offsetHeight,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      if (imgData === 'data:,') throw new Error('فشل التقاط صورة لكشف الحساب.');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${filename}.pdf`);
      resolve();
    } catch (error: any) {
      console.error('Error generating Partner Statement PDF:', error);
      reject(error);
    } finally {
      setTimeout(() => {
        root.unmount();
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }, 200);
    }
  });
};
