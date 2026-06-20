import { appendEvidencePagesToPdf } from "@/lib/pdfEvidencePages";
import {
  canvasToJpegDataUrl,
  PDF_JPEG_QUALITY,
} from "@/lib/pdfImageCompression";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;
/** html2canvas multiplier; 2 keeps text sharp on A4 without bloating file size. */
const DEFAULT_PDF_SCALE = 2;

export type PdfOrientation = "portrait" | "landscape";

type PdfOptions = {
  scale?: number;
  orientation?: PdfOrientation;
  jpegQuality?: number;
};

export type AuditPdfExportOptions = PdfOptions & {
  includeEvidencePages?: boolean;
  evidencePhotos?: ReportEvidencePhoto[];
  /** Shown in PDF viewer metadata and used when saving the file. */
  documentTitle?: string;
};

export function buildAuditPdfFilename(formTitle: string, tenantSlug?: string) {
  const safeTitle = formTitle
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const base = safeTitle || "form";
  const brand =
    tenantSlug
      ?.trim()
      .replace(/[^\w-]+/g, "")
      .slice(0, 40) || "";
  return brand ? `${brand}-${base}.pdf` : `${base}.pdf`;
}

function getPageSizeMm(orientation: "portrait" | "landscape") {
  return {
    width: orientation === "landscape" ? 297 : 210,
    height: orientation === "landscape" ? 210 : 297,
  };
}

function getTargetRenderWidthPx(orientation: "portrait" | "landscape") {
  const page = getPageSizeMm(orientation);
  return Math.round((page.width - DEFAULT_MARGIN_MM * 2) * PX_PER_MM);
}

function stripEvidenceThumbsForPdf(clone: HTMLElement) {
  clone.querySelectorAll(".report-evidence-thumb-grid").forEach((node) => {
    node.remove();
  });
  clone.querySelectorAll(".report-evidence-pdf-note").forEach((node) => {
    (node as HTMLElement).style.display = "block";
  });
}

/** Shrink wide tables so they fit the PDF page width without clipping. */
function fitWideTablesForPdf(clone: HTMLElement) {
  clone.querySelectorAll(".report-table-wrap").forEach((node) => {
    const wrap = node as HTMLElement;
    const table = wrap.querySelector(
      "table.report-data-table",
    ) as HTMLElement | null;
    if (!table) return;

    const colCount = table.querySelectorAll("thead th").length;
    let fontSize = "11px";
    if (colCount >= 8) fontSize = "8px";
    else if (colCount >= 7) fontSize = "8.5px";
    else if (colCount >= 6) fontSize = "9px";
    else if (colCount >= 5) fontSize = "10px";

    wrap.style.overflow = "visible";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "100%";

    table.classList.remove("min-w-max");
    table.style.width = "100%";
    table.style.minWidth = "0";
    table.style.maxWidth = "100%";
    table.style.tableLayout = "fixed";
    table.style.fontSize = fontSize;

    table.querySelectorAll("th, td").forEach((cell) => {
      const el = cell as HTMLElement;
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.whiteSpace = "normal";
      el.style.fontSize = fontSize;
      el.style.padding = colCount >= 6 ? "3px 4px" : "4px 6px";
    });
  });
}

async function captureForPdf(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  stripEvidenceThumbs = false,
) {
  const { default: html2canvas } = await import("html2canvas");
  const clone = element.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${targetWidthPx}px`;
  host.style.background = "#fff";
  host.style.zIndex = "-1";

  clone.classList.add("pdf-generation-mode", "report-export-root");
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.fontSize = "14px";
  clone.style.overflow = "visible";

  if (stripEvidenceThumbs) {
    stripEvidenceThumbsForPdf(clone);
  }

  fitWideTablesForPdf(clone);

  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    return await html2canvas(clone, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: clone.scrollWidth,
      height: clone.scrollHeight,
      windowWidth: targetWidthPx,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    host.remove();
  }
}

function applyPdfDocumentTitle(pdf: import("jspdf").jsPDF, title?: string) {
  const trimmed = title?.trim();
  if (!trimmed) return;
  try {
    pdf.setProperties({ title: trimmed, subject: trimmed });
  } catch {
    // ignore metadata errors on older runtimes
  }
}

async function canvasToA4Pdf(
  canvas: HTMLCanvasElement,
  orientation: "portrait" | "landscape",
  documentTitle?: string,
  jpegQuality = PDF_JPEG_QUALITY,
) {
  const { default: jsPDF } = await import("jspdf");
  const page = getPageSizeMm(orientation);
  const contentWidthMm = page.width - DEFAULT_MARGIN_MM * 2;
  const contentHeightMm = page.height - DEFAULT_MARGIN_MM * 2;

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });
  applyPdfDocumentTitle(pdf, documentTitle);

  // Fit content to page width, then slice vertically across pages.
  const pageSliceHeightPx = Math.max(
    1,
    Math.floor((canvas.width * contentHeightMm) / contentWidthMm),
  );

  let renderedHeightPx = 0;
  let isFirstPage = true;

  while (renderedHeightPx < canvas.height) {
    const sliceHeightPx = Math.min(
      pageSliceHeightPx,
      canvas.height - renderedHeightPx,
    );
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;

    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to prepare PDF page canvas");
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
      sliceHeightPx,
    );

    if (!isFirstPage) {
      pdf.addPage("a4", orientation);
    }

    const sliceHeightMm = (sliceHeightPx * contentWidthMm) / canvas.width;
    pdf.addImage(
      canvasToJpegDataUrl(sliceCanvas, jpegQuality),
      "JPEG",
      DEFAULT_MARGIN_MM,
      DEFAULT_MARGIN_MM,
      contentWidthMm,
      sliceHeightMm,
      undefined,
      "FAST",
    );

    renderedHeightPx += sliceHeightPx;
    isFirstPage = false;
  }

  return pdf;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateAuditReportPdf(
  element: HTMLElement,
  filename: string = "report.pdf",
  options?: AuditPdfExportOptions,
): Promise<void> {
  const {
    scale = DEFAULT_PDF_SCALE,
    orientation = "landscape",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = PDF_JPEG_QUALITY,
  } = options || {};

  try {
    const canvas = await captureForPdf(
      element,
      orientation,
      scale,
      includeEvidencePages && evidencePhotos.length > 0,
    );
    const pdf = await canvasToA4Pdf(
      canvas,
      orientation,
      documentTitle,
      jpegQuality,
    );

    if (includeEvidencePages && evidencePhotos.length > 0) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        orientation,
        jpegQuality,
      );
    }

    const blob = pdf.output("blob") as Blob;
    triggerBlobDownload(blob, filename);
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    throw new Error("Failed to generate PDF. Please try again.");
  }
}

export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string = "report.pdf",
  options?: PdfOptions,
): Promise<void> {
  return generateAuditReportPdf(element, filename, options);
}

export async function generatePdfBlobFromElement(
  element: HTMLElement,
  options?: AuditPdfExportOptions,
): Promise<Blob> {
  const {
    scale = DEFAULT_PDF_SCALE,
    orientation = "landscape",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = PDF_JPEG_QUALITY,
  } = options || {};

  try {
    const canvas = await captureForPdf(
      element,
      orientation,
      scale,
      includeEvidencePages && evidencePhotos.length > 0,
    );
    const pdf = await canvasToA4Pdf(
      canvas,
      orientation,
      documentTitle,
      jpegQuality,
    );

    if (includeEvidencePages && evidencePhotos.length > 0) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        orientation,
        jpegQuality,
      );
    }

    return pdf.output("blob") as Blob;
  } catch (error) {
    console.error("Failed to generate PDF blob:", error);
    throw new Error("Failed to generate PDF. Please try again.");
  }
}
