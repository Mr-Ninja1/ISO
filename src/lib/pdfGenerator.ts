const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;

type PdfOptions = {
  scale?: number;
  orientation?: 'portrait' | 'landscape';
};

function getPageSizeMm(orientation: 'portrait' | 'landscape') {
  return {
    width: orientation === 'landscape' ? 297 : 210,
    height: orientation === 'landscape' ? 210 : 297,
  };
}

function getTargetRenderWidthPx(orientation: 'portrait' | 'landscape') {
  const page = getPageSizeMm(orientation);
  return Math.round(page.width * PX_PER_MM);
}

async function captureForPdf(
  element: HTMLElement,
  orientation: 'portrait' | 'landscape',
  scale: number
) {
  const { default: html2canvas } = await import('html2canvas');
  const clone = element.cloneNode(true) as HTMLElement;
  const host = document.createElement('div');
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${targetWidthPx}px`;
  host.style.background = '#fff';
  host.style.zIndex = '-1';

  clone.classList.add('pdf-generation-mode');
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;
  clone.style.margin = '0';
  clone.style.transform = 'none';

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    return await html2canvas(clone, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: clone.scrollWidth,
      height: clone.scrollHeight,
      windowWidth: targetWidthPx,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    host.remove();
  }
}

async function canvasToA4Pdf(canvas: HTMLCanvasElement, orientation: 'portrait' | 'landscape') {
  const { default: jsPDF } = await import('jspdf');
  const page = getPageSizeMm(orientation);
  const contentWidthMm = page.width - DEFAULT_MARGIN_MM * 2;
  const contentHeightMm = page.height - DEFAULT_MARGIN_MM * 2;

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  // Keep scale stable by fitting width, then slicing vertically into A4 pages.
  const pageSliceHeightPx = Math.max(
    1,
    Math.floor((canvas.width * contentHeightMm) / contentWidthMm)
  );

  let renderedHeightPx = 0;
  let isFirstPage = true;

  while (renderedHeightPx < canvas.height) {
    const sliceHeightPx = Math.min(pageSliceHeightPx, canvas.height - renderedHeightPx);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;

    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to prepare PDF page canvas');
    }

    ctx.drawImage(
      canvas,
      0,
      renderedHeightPx,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx
    );

    if (!isFirstPage) {
      pdf.addPage('a4', orientation);
    }

    const sliceHeightMm = (sliceHeightPx * contentWidthMm) / canvas.width;
    pdf.addImage(
      sliceCanvas.toDataURL('image/png'),
      'PNG',
      DEFAULT_MARGIN_MM,
      DEFAULT_MARGIN_MM,
      contentWidthMm,
      sliceHeightMm
    );

    renderedHeightPx += sliceHeightPx;
    isFirstPage = false;
  }

  return pdf;
}

export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string = 'report.pdf',
  options?: PdfOptions
): Promise<void> {
  const { scale = 2, orientation = 'landscape' } = options || {};

  try {
    const canvas = await captureForPdf(element, orientation, scale);
    const pdf = await canvasToA4Pdf(canvas, orientation);

    pdf.save(filename);
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}

export async function generatePdfBlobFromElement(
  element: HTMLElement,
  options?: PdfOptions
): Promise<Blob> {
  const { scale = 2, orientation = 'landscape' } = options || {};

  try {
    const canvas = await captureForPdf(element, orientation, scale);
    const pdf = await canvasToA4Pdf(canvas, orientation);

    return pdf.output('blob') as Blob;
  } catch (error) {
    console.error('Failed to generate PDF blob:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}
