import { appendEvidencePagesToPdf } from "@/lib/pdfEvidencePages";
import {
  canvasToJpegDataUrl,
  PDF_JPEG_QUALITY,
} from "@/lib/pdfImageCompression";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;
/** html2canvas multiplier; 2 keeps text sharp on A4 without bloating file size. */
const DEFAULT_PDF_SCALE = 2;
/** Lower scale on native WebView to reduce memory spikes during html2canvas. */
const NATIVE_PDF_SCALE = 1.25;
/** Last-resort scale when the first capture fails on a constrained WebView. */
const NATIVE_PDF_FALLBACK_SCALE = 1;

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
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}

function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth);
      canvas.height = Math.max(1, img.naturalHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to prepare inline image canvas"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvasToJpegDataUrl(canvas, PDF_JPEG_QUALITY));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("Could not load image for PDF"));
    img.src = src;
  });
}

async function inlineRemoteImageSrc(src: string): Promise<string> {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }

  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Image fetch failed (${response.status})`);
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return loadImageAsDataUrl(src);
  }
}

/** Cross-origin images taint html2canvas on Capacitor WebView — inline them first. */
async function inlineRemoteImagesForPdf(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.currentSrc || img.getAttribute("src") || img.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;

      try {
        const dataUrl = await inlineRemoteImageSrc(src);
        img.setAttribute("src", dataUrl);
        img.removeAttribute("srcset");
        img.removeAttribute("crossorigin");
      } catch (error) {
        console.warn("[pdf] Dropping image that could not be inlined:", src, error);
        img.style.display = "none";
      }
    }),
  );
}

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

async function renderPdfCanvas(
  clone: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
) {
  const { default: html2canvas } = await import("html2canvas");
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  return html2canvas(clone, {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    width: clone.scrollWidth,
    height: clone.scrollHeight,
    windowWidth: targetWidthPx,
    windowHeight: clone.scrollHeight,
    imageTimeout: 15_000,
  });
}

async function captureForPdf(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  stripEvidenceThumbs = false,
) {
  const clone = element.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.width = `${targetWidthPx}px`;
  host.style.background = "#fff";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  host.style.zIndex = "-1";
  host.style.overflow = "hidden";

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
    await inlineRemoteImagesForPdf(clone);

    try {
      return await renderPdfCanvas(clone, orientation, scale);
    } catch (firstError) {
      if (!isCapacitorNativeApp()) {
        throw firstError;
      }

      const fallbackScale = Math.min(scale, NATIVE_PDF_FALLBACK_SCALE);
      console.warn(
        "[pdf] Native capture failed, retrying with lower scale:",
        firstError,
      );
      return await renderPdfCanvas(clone, orientation, fallbackScale);
    }
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

function resolvePdfScale(scaleOption?: number) {
  if (typeof scaleOption === "number" && Number.isFinite(scaleOption)) {
    return scaleOption;
  }
  return isCapacitorNativeApp() ? NATIVE_PDF_SCALE : DEFAULT_PDF_SCALE;
}

export { resolvePdfScale };

function isUserCancelledShare(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] || "" : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read PDF blob"));
    reader.readAsDataURL(blob);
  });
}

async function deliverPdfBlobViaCapacitor(blob: Blob, filename: string): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");
    const path = `exports/${Date.now()}-${safeName}`;
    const base64 = await blobToBase64(blob);

    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });

    await Share.share({
      title: safeName.replace(/\.pdf$/i, "") || "Form report",
      files: [uri],
      dialogTitle: "Share PDF",
    });
    return true;
  } catch (error) {
    if (isUserCancelledShare(error)) return true;
    console.warn("[pdf] Capacitor share failed:", error);
    return false;
  }
}

async function deliverPdfBlobViaWebShare(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  try {
    const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");
    const title = safeName.replace(/\.pdf$/i, "") || "Form report";
    const file = new File([blob], safeName, { type: "application/pdf" });
    const canShareFiles =
      typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });

    if (!canShareFiles) return false;

    await navigator.share({ title, files: [file] });
    return true;
  } catch (error) {
    if (isUserCancelledShare(error)) return true;
    console.warn("[pdf] Web Share failed:", error);
    return false;
  }
}

/** Browser download on web; native share sheet in the Capacitor WebView (blob downloads navigate away). */
export async function deliverPdfBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");

  if (await deliverPdfBlobViaWebShare(blob, safeName)) {
    return;
  }

  if (await deliverPdfBlobViaCapacitor(blob, safeName)) {
    return;
  }

  if (isCapacitorNativeApp()) {
    throw new Error(
      "PDF was created but could not open the share sheet. Try again, or export from a desktop browser.",
    );
  }

  triggerBlobDownload(blob, safeName);
}

export function prefersNativePdfShare(): boolean {
  return isCapacitorNativeApp();
}

export async function generateAuditReportPdf(
  element: HTMLElement,
  filename: string = "report.pdf",
  options?: AuditPdfExportOptions,
): Promise<void> {
  const {
    scale = resolvePdfScale(options?.scale),
    orientation = "landscape",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = PDF_JPEG_QUALITY,
  } = options || {};

  let blob: Blob;
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

    blob = pdf.output("blob") as Blob;
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    throw new Error("Failed to generate PDF. Please try again.");
  }

  try {
    await deliverPdfBlob(blob, filename);
  } catch (error) {
    if (isUserCancelledShare(error)) return;
    console.error("Failed to deliver PDF:", error);
    throw error instanceof Error
      ? error
      : new Error("Could not share the PDF. Please try again.");
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
    scale = resolvePdfScale(options?.scale),
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
