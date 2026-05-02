import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string = 'report.pdf',
  options?: {
    scale?: number;
    orientation?: 'portrait' | 'landscape';
  }
): Promise<void> {
  const { scale = 2, orientation = 'portrait' } = options || {};

  try {
    // Temporarily add a class to force simple colors for html2canvas
    const originalClass = element.className;
    element.classList.add('pdf-generation-mode');

    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      ignoreElements: (element) => {
        // Skip elements that might cause issues
        return false;
      },
    }).finally(() => {
      // Remove the temporary class
      element.classList.remove('pdf-generation-mode');
    });

    // Calculate PDF dimensions
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // A4 dimensions in mm
    const a4Width = orientation === 'landscape' ? 297 : 210;
    const a4Height = orientation === 'landscape' ? 210 : 297;
    
    // Convert canvas dimensions to mm (1 pixel = 0.264583 mm at 96 DPI)
    const imgWidthMm = imgWidth * 0.264583;
    const imgHeightMm = imgHeight * 0.264583;
    
    // Calculate scale based on orientation to maximize space usage
    // Landscape: prioritize fitting width, Portrait: prioritize fitting height
    let ratio: number;
    if (orientation === 'landscape') {
      // For landscape, fit to width first, then check if height fits
      ratio = a4Width / imgWidthMm;
      if (imgHeightMm * ratio > a4Height) {
        // If height overflows, scale down to fit
        ratio = a4Height / imgHeightMm;
      }
    } else {
      // For portrait, fit to height first, then check if width fits
      ratio = a4Height / imgHeightMm;
      if (imgWidthMm * ratio > a4Width) {
        // If width overflows, scale down to fit
        ratio = a4Width / imgWidthMm;
      }
    }
    
    const pdfWidth = imgWidthMm * ratio;
    const pdfHeight = imgHeightMm * ratio;

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    // Add image to PDF (centered)
    const x = (a4Width - pdfWidth) / 2;
    const y = (a4Height - pdfHeight) / 2;
    pdf.addImage(imgData, 'PNG', x, y, pdfWidth, pdfHeight);

    // Save PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}

export async function generatePdfBlobFromElement(
  element: HTMLElement,
  options?: {
    scale?: number;
    orientation?: 'portrait' | 'landscape';
  }
): Promise<Blob> {
  const { scale = 2, orientation = 'portrait' } = options || {};

  try {
    // Temporarily add a class to force simple colors for html2canvas
    element.classList.add('pdf-generation-mode');

    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    }).finally(() => {
      // Remove the temporary class
      element.classList.remove('pdf-generation-mode');
    });

    // Calculate PDF dimensions
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // A4 dimensions in mm
    const a4Width = orientation === 'landscape' ? 297 : 210;
    const a4Height = orientation === 'landscape' ? 210 : 297;
    
    // Convert canvas dimensions to mm (1 pixel = 0.264583 mm at 96 DPI)
    const imgWidthMm = imgWidth * 0.264583;
    const imgHeightMm = imgHeight * 0.264583;
    
    // Calculate scale based on orientation to maximize space usage
    // Landscape: prioritize fitting width, Portrait: prioritize fitting height
    let ratio: number;
    if (orientation === 'landscape') {
      // For landscape, fit to width first, then check if height fits
      ratio = a4Width / imgWidthMm;
      if (imgHeightMm * ratio > a4Height) {
        // If height overflows, scale down to fit
        ratio = a4Height / imgHeightMm;
      }
    } else {
      // For portrait, fit to height first, then check if width fits
      ratio = a4Height / imgHeightMm;
      if (imgWidthMm * ratio > a4Width) {
        // If width overflows, scale down to fit
        ratio = a4Width / imgWidthMm;
      }
    }
    
    const pdfWidth = imgWidthMm * ratio;
    const pdfHeight = imgHeightMm * ratio;

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
    });

    // Add image to PDF (centered)
    const x = (a4Width - pdfWidth) / 2;
    const y = (a4Height - pdfHeight) / 2;
    pdf.addImage(imgData, 'PNG', x, y, pdfWidth, pdfHeight);

    // Return as blob
    return pdf.output('blob') as Blob;
  } catch (error) {
    console.error('Failed to generate PDF blob:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}
