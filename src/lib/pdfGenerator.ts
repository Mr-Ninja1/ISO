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
/** Native WebView — 1.0 is faster and still sharp enough for A4 export. */
const NATIVE_PDF_SCALE = 1;
/** Last-resort scale when the first capture fails on a constrained WebView. */
const NATIVE_PDF_FALLBACK_SCALE = 0.85;
/** Cap logos/signatures while inlining so html2canvas does less work. */
const PDF_INLINE_IMAGE_MAX_PX = 720;
/** Slightly lower quality on native for faster encode with little visible loss. */
const NATIVE_PDF_JPEG_QUALITY = 0.62;

let pdfLibsWarmPromise: Promise<void> | null = null;

/** Preload heavy PDF libs (call from report UI while user reads the form). */
export function warmPdfGenerationLibs() {
  if (typeof window === "undefined") return;
  if (!pdfLibsWarmPromise) {
    pdfLibsWarmPromise = Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]).then(() => undefined);
  }
  return pdfLibsWarmPromise;
}

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

function loadImageAsDataUrl(
  src: string,
  maxPx = PDF_INLINE_IMAGE_MAX_PX,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(
        1,
        maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1),
      );
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to prepare inline image canvas"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
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

    const lineHeight = colCount >= 7 ? "1.3" : "1.35";
    const padding = colCount >= 6 ? "4px 4px" : "5px 6px";

    table.classList.remove("min-w-max");
    table.classList.add("pdf-compact-table");
    table.style.width = "100%";
    table.style.minWidth = "0";
    table.style.maxWidth = "100%";
    table.style.tableLayout = "fixed";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0";
    table.style.setProperty("--pdf-table-font-size", fontSize);
    table.style.setProperty("--pdf-table-line-height", lineHeight);
    table.style.setProperty("--pdf-table-cell-padding", padding);

    table.querySelectorAll("th, td").forEach((cell) => {
      const el = cell as HTMLElement;
      el.style.wordBreak = "break-word";
      el.style.overflowWrap = "anywhere";
      el.style.whiteSpace = "normal";
      el.style.verticalAlign = "top";
      el.style.height = "auto";
    });
  });
}

async function renderPdfCanvas(
  clone: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  html2canvasModule?: typeof import("html2canvas"),
) {
  const { default: html2canvas } =
    html2canvasModule ?? (await import("html2canvas"));
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
    imageTimeout: isCapacitorNativeApp() ? 8_000 : 15_000,
    removeContainer: true,
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

  const html2canvasPromise = import("html2canvas");

  try {
    await inlineRemoteImagesForPdf(clone);
    const html2canvasModule = await html2canvasPromise;

    try {
      return await renderPdfCanvas(clone, orientation, scale, html2canvasModule);
    } catch (firstError) {
      if (!isCapacitorNativeApp()) {
        throw firstError;
      }

      const fallbackScale = Math.min(scale, NATIVE_PDF_FALLBACK_SCALE);
      console.warn(
        "[pdf] Native capture failed, retrying with lower scale:",
        firstError,
      );
      return await renderPdfCanvas(
        clone,
        orientation,
        fallbackScale,
        html2canvasModule,
      );
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

function resolvePdfJpegQuality(qualityOption?: number) {
  if (typeof qualityOption === "number" && Number.isFinite(qualityOption)) {
    return qualityOption;
  }
  return isCapacitorNativeApp() ? NATIVE_PDF_JPEG_QUALITY : PDF_JPEG_QUALITY;
}

export { resolvePdfScale };

export type PdfSaveResult = {
  /** Human-readable path shown after a native save (e.g. Documents/ISO Grid/report.pdf). */
  savedPathLabel: string;
};

/** Short native-save confirmation for alerts. */
export function formatPdfSavedMessage(savedPathLabel: string): string {
  const folder = savedPathLabel.startsWith("Download/")
    ? "Downloads"
    : "Documents";
  const fileName = savedPathLabel.split("/").pop() || "report.pdf";
  return `PDF saved: ${fileName}\nFiles → ${folder} → ISO Grid`;
}

const NATIVE_PDF_FOLDER = "ISO Grid";

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

function isCapacitorPluginMissing(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /not implemented|unimplemented|plugin/i.test(message);
}

async function ensurePublicStoragePermission(
  Filesystem: typeof import("@capacitor/filesystem").Filesystem,
) {
  try {
    const status = await Filesystem.checkPermissions();
    if (status.publicStorage === "granted") return;
    const requested = await Filesystem.requestPermissions();
    if (requested.publicStorage !== "granted") {
      throw new Error(
        "Storage permission is required to save PDFs on your device.",
      );
    }
  } catch (error) {
    if (isCapacitorPluginMissing(error)) throw error;
    console.warn("[pdf] Storage permission check failed:", error);
  }
}

async function savePdfBlobOnDevice(
  blob: Blob,
  filename: string,
): Promise<PdfSaveResult> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");
  const base64 = await blobToBase64(blob);
  const relativePath = `${NATIVE_PDF_FOLDER}/${safeName}`;

  const targets: Array<{
    directory: import("@capacitor/filesystem").Directory;
    path: string;
    label: string;
  }> = [
    {
      directory: Directory.Documents,
      path: relativePath,
      label: `Documents/${relativePath}`,
    },
    {
      directory: Directory.ExternalStorage,
      path: `Download/${relativePath}`,
      label: `Download/${relativePath}`,
    },
  ];

  let lastError: unknown;

  for (const target of targets) {
    try {
      await ensurePublicStoragePermission(Filesystem);
      await Filesystem.writeFile({
        path: target.path,
        data: base64,
        directory: target.directory,
        recursive: true,
      });
      return { savedPathLabel: target.label };
    } catch (error) {
      lastError = error;
      console.warn("[pdf] Could not save to", target.label, error);
    }
  }

  if (isCapacitorPluginMissing(lastError)) {
    throw new Error(
      "This app build cannot save files on the device. Install the latest APK (v1.5.0 or newer), then try again.",
    );
  }

  throw new Error(
    "Could not save the PDF to your device. Allow storage access if prompted, then try again.",
  );
}

/** Browser download on web; save to Documents/Download on native. */
export async function deliverPdfBlob(
  blob: Blob,
  filename: string,
): Promise<PdfSaveResult | null> {
  const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");

  if (isCapacitorNativeApp()) {
    return savePdfBlobOnDevice(blob, safeName);
  }

  triggerBlobDownload(blob, safeName);
  return null;
}

export function prefersNativePdfSave(): boolean {
  return isCapacitorNativeApp();
}

/** @deprecated Use prefersNativePdfSave */
export function prefersNativePdfShare(): boolean {
  return prefersNativePdfSave();
}

export async function generateAuditReportPdf(
  element: HTMLElement,
  filename: string = "report.pdf",
  options?: AuditPdfExportOptions,
): Promise<PdfSaveResult | null> {
  const {
    scale = resolvePdfScale(options?.scale),
    orientation = "landscape",
    includeEvidencePages = false,
    evidencePhotos = [],
    documentTitle,
    jpegQuality = resolvePdfJpegQuality(options?.jpegQuality),
  } = options || {};

  warmPdfGenerationLibs();

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
    return await deliverPdfBlob(blob, filename);
  } catch (error) {
    console.error("Failed to deliver PDF:", error);
    throw error instanceof Error
      ? error
      : new Error("Could not save the PDF. Please try again.");
  }
}

export async function generatePdfFromElement(
  element: HTMLElement,
  filename: string = "report.pdf",
  options?: PdfOptions,
): Promise<PdfSaveResult | null> {
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
    jpegQuality = resolvePdfJpegQuality(options?.jpegQuality),
  } = options || {};

  warmPdfGenerationLibs();

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
