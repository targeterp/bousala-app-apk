import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

export const exportTableToPDF = async (tableId: string, filename: string) => {
  const originalTable = document.getElementById(tableId);
  if (!originalTable) {
    console.error(`Table with ID ${tableId} not found.`);
    toast.error('لم يتم العثور على الجدول');
    return;
  }

  try {
    // Clone the table to avoid modifying the original DOM and to capture full height
    const clonedTable = originalTable.cloneNode(true) as HTMLElement;
    
    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.zIndex = '-9999';
    container.style.width = '1000px'; // Fixed width for consistent rendering
    container.style.background = '#ffffff';
    container.style.padding = '20px';
    container.style.direction = 'rtl'; // Ensure RTL for Arabic
    
    // Remove any max-height or overflow restrictions on the cloned table
    clonedTable.style.maxHeight = 'none';
    clonedTable.style.overflow = 'visible';
    clonedTable.classList.remove('hidden');
    clonedTable.style.display = 'table';
    
    // Remove action columns (usually the last column)
    const rows = clonedTable.querySelectorAll('tr');
    rows.forEach(row => {
      const lastCell = row.lastElementChild;
      if (lastCell && (lastCell.textContent?.includes('إجراءات') || lastCell.querySelector('button') || lastCell.querySelector('svg'))) {
        row.removeChild(lastCell);
      }
    });

    container.appendChild(clonedTable);
    document.body.appendChild(container);

    // Ensure text is black for printing
    const allElements = container.querySelectorAll('*');
    allElements.forEach(cell => {
      const el = cell as HTMLElement;
      if (!el.style.color) {
        el.style.color = '#000000';
      }
    });

    // Generate image using html-to-image
    const imgData = await toPng(container, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      style: {
        transform: 'none',
      }
    });

    document.body.removeChild(container);
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Get image dimensions to calculate aspect ratio
    const img = new Image();
    img.src = imgData;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const imgWidth = pdfWidth - 20; // 10mm margin
    const imgHeight = (img.height * imgWidth) / img.width;
    
    let heightLeft = imgHeight;
    let position = 10; // Start at 10mm from top

    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= (pdfHeight - position);

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`${filename}.pdf`);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    toast.error(`حدث خطأ أثناء إنشاء ملف PDF: ${error?.message || 'خطأ غير معروف'}`);
  }
};

export const exportElementToPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with ID ${elementId} not found.`);
    toast.error('لم يتم العثور على العنصر');
    return;
  }

  try {
    const clonedElement = element.cloneNode(true) as HTMLElement;
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.zIndex = '-9999';
    container.style.width = '800px';
    container.style.background = '#ffffff';
    container.style.padding = '40px';
    container.style.direction = 'rtl';
    
    clonedElement.style.maxHeight = 'none';
    clonedElement.style.overflow = 'visible';
    clonedElement.style.display = 'block';
    
    // Remove buttons from the cloned element
    const buttons = clonedElement.querySelectorAll('button');
    buttons.forEach(btn => btn.remove());

    container.appendChild(clonedElement);
    document.body.appendChild(container);

    const allElements = container.querySelectorAll('*');
    allElements.forEach(cell => {
      const el = cell as HTMLElement;
      el.style.color = '#000000';
    });

    const imgData = await toPng(container, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
    });

    document.body.removeChild(container);
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const img = new Image();
    img.src = imgData;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const imgWidth = pdfWidth - 20;
    const imgHeight = (img.height * imgWidth) / img.width;
    
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`${filename}.pdf`);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    toast.error(`حدث خطأ أثناء إنشاء ملف PDF: ${error?.message || 'خطأ غير معروف'}`);
  }
};
