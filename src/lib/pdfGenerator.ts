import { appendEvidencePagesToPdf } from "@/lib/pdfEvidencePages";
import {
  canvasToJpegDataUrl,
  PDF_JPEG_QUALITY,
} from "@/lib/pdfImageCompression";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;
/** Smaller scale avoids massive rasterized PDFs while keeping text readable. */
const DEFAULT_PDF_SCALE = 1;

type PdfOptions = {
  scale?: number;
  orientation?: "portrait" | "landscape";
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
  return Math.round(page.width * PX_PER_MM);
}

function stripEvidenceThumbsForPdf(clone: HTMLElement) {
  clone.querySelectorAll(".report-evidence-thumb-grid").forEach((node) => {
    node.remove();
  });
  clone.querySelectorAll(".report-evidence-pdf-note").forEach((node) => {
    (node as HTMLElement).style.display = "block";
  });
}

function createPdfCloneHost(orientation: "portrait" | "landscape") {
  const host = document.createElement("div");
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${targetWidthPx}px`;
  host.style.background = "#fff";
  host.style.zIndex = "-1";

  document.body.appendChild(host);
  return { host, targetWidthPx };
}

function preparePdfClone(
  element: HTMLElement,
  targetWidthPx: number,
  stripEvidenceThumbs = false,
) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add("pdf-generation-mode", "report-export-root");
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.fontSize = "14px";

  if (stripEvidenceThumbs) {
    stripEvidenceThumbsForPdf(clone);
  }

  return clone;
}

async function renderNodeToCanvas(node: HTMLElement, scale: number) {
  const { default: html2canvas } = await import("html2canvas");
  return await html2canvas(node, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    width: node.scrollWidth,
    height: node.scrollHeight,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
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

async function createPdfDocument(
  orientation: "portrait" | "landscape",
  documentTitle?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });
  applyPdfDocumentTitle(pdf, documentTitle);
  return pdf;
}

function addCanvasPageToPdf(
  pdf: import("jspdf").jsPDF,
  canvas: HTMLCanvasElement,
  orientation: "portrait" | "landscape",
  jpegQuality: number,
  addPage: boolean,
) {
  const page = getPageSizeMm(orientation);
  const contentWidthMm = page.width - DEFAULT_MARGIN_MM * 2;
  const contentHeightMm = page.height - DEFAULT_MARGIN_MM * 2;

  if (addPage) {
    pdf.addPage("a4", orientation);
  }

  const ratio = Math.min(
    contentWidthMm / canvas.width,
    contentHeightMm / canvas.height,
  );
  const drawWidthMm = canvas.width * ratio;
  const drawHeightMm = canvas.height * ratio;

  pdf.addImage(
    canvasToJpegDataUrl(canvas, jpegQuality),
    "JPEG",
    DEFAULT_MARGIN_MM,
    DEFAULT_MARGIN_MM,
    drawWidthMm,
    drawHeightMm,
    undefined,
    "FAST",
  );
}

function estimateRowsPerChunk(section: HTMLElement, rowCount: number) {
  const headerCells = Array.from(section.querySelectorAll("thead th"));
  const hasSignature = headerCells.some((cell) =>
    cell.textContent?.toLowerCase().includes("signature"),
  );
  const hasWideTable = headerCells.length >= 8;
  const hasMediumTable = headerCells.length >= 5;

  if (hasSignature || hasWideTable) return Math.min(8, rowCount);
  if (hasMediumTable) return Math.min(10, rowCount);
  return Math.min(14, rowCount);
}

function collectPageBlocks(root: HTMLElement): HTMLElement[] {
  const directSections = Array.from(
    root.querySelectorAll(":scope > .mt-5 > .report-section"),
  ) as HTMLElement[];
  const header = root.querySelector(
    ":scope > .report-header-block",
  ) as HTMLElement | null;
  const footer = root.querySelector(
    ":scope > .report-footer",
  ) as HTMLElement | null;

  const blocks: HTMLElement[] = [];
  if (header) blocks.push(header);

  for (const section of directSections) {
    const tableRows = Array.from(
      section.querySelectorAll("tbody > tr"),
    ) as HTMLElement[];
    if (tableRows.length === 0) {
      blocks.push(section);
      continue;
    }

    const tableWrap = section.querySelector(
      ".report-table-wrap",
    ) as HTMLElement | null;
    const table = section.querySelector("table") as HTMLTableElement | null;
    const thead = table
      ?.querySelector("thead")
      ?.cloneNode(true) as HTMLElement | null;
    if (!tableWrap || !table || !thead) {
      blocks.push(section);
      continue;
    }

    const sectionShell = section.cloneNode(true) as HTMLElement;
    const shellWrap = sectionShell.querySelector(
      ".report-table-wrap",
    ) as HTMLElement | null;
    if (!shellWrap) {
      blocks.push(section);
      continue;
    }

    shellWrap.innerHTML = "";

    const maxRowsPerChunk = estimateRowsPerChunk(section, tableRows.length);
    for (let start = 0; start < tableRows.length; start += maxRowsPerChunk) {
      const sectionPage = sectionShell.cloneNode(true) as HTMLElement;
      const pageWrap = sectionPage.querySelector(
        ".report-table-wrap",
      ) as HTMLElement | null;
      if (!pageWrap) {
        blocks.push(section);
        break;
      }

      const pageTable = table.cloneNode(false) as HTMLTableElement;
      pageTable.className = table.className;
      const pageHead = thead.cloneNode(true) as HTMLElement;
      const pageBody = document.createElement("tbody");

      for (const row of tableRows.slice(start, start + maxRowsPerChunk)) {
        pageBody.appendChild(row.cloneNode(true));
      }

      pageTable.appendChild(pageHead);
      pageTable.appendChild(pageBody);
      pageWrap.innerHTML = "";
      pageWrap.appendChild(pageTable);
      blocks.push(sectionPage);
    }
  }

  if (footer) blocks.push(footer);
  return blocks;
}

async function generatePdfFromBlocks(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  documentTitle?: string,
  jpegQuality = PDF_JPEG_QUALITY,
  stripEvidenceThumbs = false,
) {
  const pdf = await createPdfDocument(orientation, documentTitle);
  const { host, targetWidthPx } = createPdfCloneHost(orientation);

  try {
    const clone = preparePdfClone(element, targetWidthPx, stripEvidenceThumbs);
    host.appendChild(clone);

    const blocks = collectPageBlocks(clone);
    let first = true;

    for (const block of blocks) {
      const pageRoot = document.createElement("div");
      pageRoot.className = "pdf-generation-mode report-export-root";
      pageRoot.style.width = `${targetWidthPx}px`;
      pageRoot.style.maxWidth = `${targetWidthPx}px`;
      pageRoot.style.margin = "0";
      pageRoot.style.padding = "16px";
      pageRoot.style.background = "#ffffff";
      pageRoot.appendChild(block.cloneNode(true));
      host.appendChild(pageRoot);

      const canvas = await renderNodeToCanvas(pageRoot, scale);
      addCanvasPageToPdf(pdf, canvas, orientation, jpegQuality, !first);
      first = false;
      pageRoot.remove();
    }

    return pdf;
  } finally {
    host.remove();
  }
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
    const pdf = await generatePdfFromBlocks(
      element,
      orientation,
      scale,
      documentTitle,
      jpegQuality,
      includeEvidencePages && evidencePhotos.length > 0,
    );

    if (includeEvidencePages && evidencePhotos.length > 0) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        orientation,
        jpegQuality,
      );
    }

    pdf.save(filename);
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
    const pdf = await generatePdfFromBlocks(
      element,
      orientation,
      scale,
      documentTitle,
      jpegQuality,
      includeEvidencePages && evidencePhotos.length > 0,
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
