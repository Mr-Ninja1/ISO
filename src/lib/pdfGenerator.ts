import { appendEvidencePagesToPdf } from "@/lib/pdfEvidencePages";
import {
  canvasToJpegDataUrl,
  PDF_JPEG_QUALITY,
} from "@/lib/pdfImageCompression";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;
const LANDSCAPE_MARGIN_MM = 6;
/** Smaller scale avoids massive rasterized PDFs while keeping text readable. */
const DEFAULT_PDF_SCALE = 1;

export type PdfOrientation = "portrait" | "landscape" | "auto";

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

function getMarginMm(orientation: "portrait" | "landscape") {
  return orientation === "landscape" ? LANDSCAPE_MARGIN_MM : DEFAULT_MARGIN_MM;
}

function getTargetRenderWidthPx(orientation: "portrait" | "landscape") {
  const page = getPageSizeMm(orientation);
  const margin = getMarginMm(orientation);
  return Math.round((page.width - margin * 2) * PX_PER_MM);
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

function fitWideTablesForPdf(clone: HTMLElement) {
  clone.querySelectorAll(".report-table-wrap").forEach((node) => {
    const wrap = node as HTMLElement;
    const table = wrap.querySelector(
      "table.report-data-table",
    ) as HTMLElement | null;
    if (!table) return;

    const colCount = table.querySelectorAll("thead th").length;
    let fontSize = "12px";
    if (colCount >= 8) fontSize = "8.5px";
    else if (colCount >= 7) fontSize = "9px";
    else if (colCount >= 6) fontSize = "9.5px";
    else if (colCount >= 5) fontSize = "10.5px";

    wrap.style.overflow = "visible";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "100%";
    wrap.style.setProperty("font-size", fontSize, "important");

    table.classList.remove("min-w-max", "w-full");
    table.style.transform = "none";
    table.style.transformOrigin = "";
    table.style.width = "100%";
    table.style.minWidth = "0";
    table.style.maxWidth = "100%";
    table.style.tableLayout = "fixed";
    table.style.setProperty("font-size", fontSize, "important");

    table.querySelectorAll("th, td").forEach((cell) => {
      const el = cell as HTMLElement;
      el.style.width = "";
      el.style.minWidth = "0";
      el.style.maxWidth = "";
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.whiteSpace = "normal";
      el.style.padding = colCount >= 6 ? "3px 4px" : "4px 6px";
      el.style.setProperty("font-size", fontSize, "important");
    });

    wrap.style.minHeight = "";
  });
}

function preparePdfClone(
  element: HTMLElement,
  targetWidthPx: number,
  orientation: "portrait" | "landscape",
  stripEvidenceThumbs = false,
) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add("pdf-generation-mode", "report-export-root");
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.fontSize = orientation === "landscape" ? "13px" : "14px";
  clone.style.overflow = "visible";

  clone.setAttribute("data-pdf-orientation", orientation);

  fitWideTablesForPdf(clone);

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
  const marginMm = getMarginMm(orientation);
  const contentWidthMm = page.width - marginMm * 2;
  const contentHeightMm = page.height - marginMm * 2;

  if (addPage) {
    pdf.addPage("a4", orientation);
  }

  const pxPerMm = canvas.width / contentWidthMm;
  const pageSliceHeightPx = Math.max(1, Math.floor(contentHeightMm * pxPerMm));
  const totalSlices = Math.max(1, Math.ceil(canvas.height / pageSliceHeightPx));

  for (let slice = 0; slice < totalSlices; slice += 1) {
    if (slice > 0) {
      pdf.addPage("a4", orientation);
    }

    const sourceY = slice * pageSliceHeightPx;
    const sourceHeight = Math.min(pageSliceHeightPx, canvas.height - sourceY);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sourceHeight;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) continue;

    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      sourceHeight,
    );

    const drawHeightMm = sourceHeight / pxPerMm;

    pdf.addImage(
      canvasToJpegDataUrl(sliceCanvas, jpegQuality),
      "JPEG",
      marginMm,
      marginMm,
      contentWidthMm,
      drawHeightMm,
      undefined,
      "FAST",
    );
  }
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

function detectBestPdfOrientation(
  element: HTMLElement,
): "portrait" | "landscape" {
  const tables = Array.from(
    element.querySelectorAll(".report-table-wrap table.report-data-table"),
  ) as HTMLElement[];

  const tableWidths = tables.map((node) => node.scrollWidth);
  const widestTable = tableWidths.length ? Math.max(...tableWidths) : 0;

  const maxColumnCount = tables.reduce((max, table) => {
    const count = table.querySelectorAll("thead th").length;
    return Math.max(max, count);
  }, 0);

  if (widestTable >= 820 || maxColumnCount >= 5) return "landscape";

  return "portrait";
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
    const clone = preparePdfClone(
      element,
      targetWidthPx,
      orientation,
      stripEvidenceThumbs,
    );
    host.appendChild(clone);

    const blocks = collectPageBlocks(clone);
    let first = true;

    for (const block of blocks) {
      const pageRoot = document.createElement("div");
      pageRoot.className = "pdf-generation-mode report-export-root";
      pageRoot.style.width = `${targetWidthPx}px`;
      pageRoot.style.maxWidth = `${targetWidthPx}px`;
      pageRoot.style.margin = "0";
      pageRoot.style.padding = orientation === "landscape" ? "10px" : "16px";
      pageRoot.style.background = "#ffffff";
      pageRoot.style.overflow = "visible";
      pageRoot.appendChild(block.cloneNode(true));
      host.appendChild(pageRoot);

      fitWideTablesForPdf(pageRoot);

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
    orientation = "auto",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = PDF_JPEG_QUALITY,
  } = options || {};

  try {
    const resolvedOrientation =
      orientation === "auto" ? detectBestPdfOrientation(element) : orientation;

    const pdf = await generatePdfFromBlocks(
      element,
      resolvedOrientation,
      scale,
      documentTitle,
      jpegQuality,
      includeEvidencePages && evidencePhotos.length > 0,
    );

    if (includeEvidencePages && evidencePhotos.length > 0) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        resolvedOrientation,
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
    orientation = "auto",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = PDF_JPEG_QUALITY,
  } = options || {};

  try {
    const resolvedOrientation =
      orientation === "auto" ? detectBestPdfOrientation(element) : orientation;

    const pdf = await generatePdfFromBlocks(
      element,
      resolvedOrientation,
      scale,
      documentTitle,
      jpegQuality,
      includeEvidencePages && evidencePhotos.length > 0,
    );

    if (includeEvidencePages && evidencePhotos.length > 0) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        resolvedOrientation,
        jpegQuality,
      );
    }

    return pdf.output("blob") as Blob;
  } catch (error) {
    console.error("Failed to generate PDF blob:", error);
    throw new Error("Failed to generate PDF. Please try again.");
  }
}
