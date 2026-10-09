import { appendEvidencePagesToPdf } from "@/lib/pdfEvidencePages";
import {
  canvasToJpegDataUrl,
  PDF_JPEG_QUALITY,
} from "@/lib/pdfImageCompression";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  reportPdfProgress,
  type PdfExportProgressCallback,
} from "@/lib/pdfExportProgress";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";
import { recommendedPdfOrientationForColumns } from "@/lib/formFieldConstants";

export type { PdfExportProgress, PdfExportStage } from "@/lib/pdfExportProgress";

const PX_PER_MM = 96 / 25.4;
const DEFAULT_MARGIN_MM = 10;
/** html2canvas multiplier; 2 keeps text sharp on A4 without bloating file size. */
const DEFAULT_PDF_SCALE = 2;
/** Native WebView — keep under ~1.0 to avoid Android canvas OOM on long reports. */
const NATIVE_PDF_SCALE = 0.65;
/** Last-resort scale when the first capture fails on a constrained WebView. */
const NATIVE_PDF_FALLBACK_SCALE = 0.45;
/**
 * Max canvas edge (px) after scale. Android WebViews often crash well below
 * the theoretical 16k–32k limit once heap pressure from images/base64 is high.
 */
const NATIVE_PDF_MAX_CANVAS_DIMENSION = 4_096;
/** Logical band height before scale — tall sections are captured in slices. */
const NATIVE_PDF_MAX_BAND_HEIGHT_PX = 1_600;
/** Cap logos/signatures while inlining so html2canvas does less work. */
const PDF_INLINE_IMAGE_MAX_PX = 720;
/** Tighter cap on native — camera photos / signatures as data URLs are the usual OOM trigger. */
const NATIVE_PDF_INLINE_IMAGE_MAX_PX = 480;
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

export function recommendedPdfOrientationForReport(
  element: HTMLElement,
): PdfOrientation {
  const widestTableColumnCount = Array.from(
    element.querySelectorAll("table.report-data-table"),
  ).reduce(
    (maxColumns, table) =>
      Math.max(maxColumns, table.querySelectorAll("thead th").length),
    0,
  );
  return recommendedPdfOrientationForColumns(widestTableColumnCount);
}

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
  /** Optional UI progress updates during export. */
  onProgress?: PdfExportProgressCallback;
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

/**
 * Always remove evidence thumbnail grids before capture.
 * CSS `display:none` is not enough — inlining still loads every photo into memory.
 * When evidence pages are appended separately, show the PDF note; otherwise hide it.
 */
function prepareEvidenceMarkupForPdf(
  clone: HTMLElement,
  includeEvidencePages: boolean,
) {
  clone.querySelectorAll(".report-evidence-thumb-grid").forEach((node) => {
    node.remove();
  });
  clone.querySelectorAll(".report-evidence-pdf-note").forEach((node) => {
    const el = node as HTMLElement;
    el.style.display = includeEvidencePages ? "block" : "none";
  });
}

function pdfInlineImageMaxPx() {
  return isCapacitorNativeApp()
    ? NATIVE_PDF_INLINE_IMAGE_MAX_PX
    : PDF_INLINE_IMAGE_MAX_PX;
}

function yieldToUi(ms = 50) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function loadImageAsDataUrl(
  src: string,
  maxPx = PDF_INLINE_IMAGE_MAX_PX,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
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
        const dataUrl = canvasToJpegDataUrl(canvas, PDF_JPEG_QUALITY);
        releaseCanvas(canvas);
        resolve(dataUrl);
      } catch (error) {
        releaseCanvas(canvas);
        reject(error);
      }
    };
    img.onerror = () => reject(new Error("Could not load image for PDF"));
    img.src = src;
  });
}

async function inlineRemoteImageSrc(
  src: string,
  maxPx = pdfInlineImageMaxPx(),
): Promise<string> {
  if (!src) return src;

  // Recompress data/blob URLs too — native reports often embed multi‑MB camera photos.
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    return loadImageAsDataUrl(src, maxPx);
  }

  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Image fetch failed (${response.status})`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImageAsDataUrl(objectUrl, maxPx);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return loadImageAsDataUrl(src, maxPx);
  }
}

/**
 * Cap every <img> (remote + data URL) before html2canvas so Android WebViews
 * do not hold full-resolution evidence/signatures in the clone DOM.
 */
async function prepareImagesForPdfCapture(root: HTMLElement) {
  const maxPx = pdfInlineImageMaxPx();
  const images = Array.from(root.querySelectorAll("img"));
  for (const img of images) {
    const src = img.currentSrc || img.getAttribute("src") || img.src;
    if (!src) continue;

    try {
      const dataUrl = await inlineRemoteImageSrc(src, maxPx);
      img.setAttribute("src", dataUrl);
      img.removeAttribute("srcset");
      img.removeAttribute("crossorigin");
      if (typeof img.decode === "function") {
        await img.decode().catch(() => undefined);
      }
    } catch (error) {
      console.warn("[pdf] Dropping image that could not be prepared:", src, error);
      img.style.display = "none";
    }
  }
}

function stripImagesForNativeFallback(clone: HTMLElement) {
  clone.querySelectorAll("img").forEach((image) => image.remove());
}

function fitWideTablesForPdf(clone: HTMLElement) {
  clone.querySelectorAll(".report-table-wrap").forEach((node) => {
    const wrap = node as HTMLElement;
    const table = wrap.querySelector(
      "table.report-data-table",
    ) as HTMLElement | null;
    if (!table) return;

    const colCount = table.querySelectorAll("thead th").length;
    let fontSize = "10px";
    if (colCount >= 12) fontSize = "6.5px";
    else if (colCount >= 10) fontSize = "7px";
    else if (colCount >= 8) fontSize = "7.5px";
    else if (colCount >= 7) fontSize = "8px";
    else if (colCount >= 6) fontSize = "9px";
    else if (colCount >= 5) fontSize = "9.5px";

    wrap.style.overflow = "visible";
    wrap.style.width = "100%";
    wrap.style.maxWidth = "100%";

    const lineHeight = colCount >= 10 ? "1.2" : colCount >= 7 ? "1.25" : "1.35";
    const padding =
      colCount >= 12
        ? "2px 2px"
        : colCount >= 8
          ? "3px 3px"
          : colCount >= 6
            ? "4px 4px"
            : "5px 6px";

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
      if (colCount >= 10) {
        el.style.fontSize = fontSize;
        el.style.padding = padding;
      }
    });
  });
}

/** If cloned report still overflows A4 content width, scale the whole sheet down. */
function fitCloneToPageWidth(clone: HTMLElement, targetWidthPx: number) {
  // Force layout at target width first.
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;

  const scrollWidth = Math.max(clone.scrollWidth, clone.offsetWidth);
  if (scrollWidth <= targetWidthPx + 2) return;

  const scale = Math.max(0.55, Math.min(1, targetWidthPx / scrollWidth));
  if (scale >= 0.995) return;

  const measuredHeight = clone.scrollHeight;
  clone.style.transformOrigin = "top left";
  clone.style.transform = `scale(${scale})`;
  clone.style.width = `${Math.ceil(targetWidthPx / scale)}px`;
  // Keep host footprint correct for html2canvas height calculation.
  clone.style.marginBottom = `${Math.ceil(measuredHeight * (scale - 1))}px`;
  clone.dataset.pdfFitScale = String(scale);
}

function resolveNativeCaptureScale(
  requestedScale: number,
  captureWidthPx: number,
  bandHeightPx: number,
) {
  if (!isCapacitorNativeApp()) return requestedScale;
  const maxDim = Math.max(captureWidthPx, bandHeightPx, 1);
  return Math.min(
    requestedScale,
    NATIVE_PDF_MAX_CANVAS_DIMENSION / maxDim,
  );
}

async function renderPdfCanvasBand(
  clipHost: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  bandHeightPx: number,
  html2canvasModule: typeof import("html2canvas"),
) {
  const { default: html2canvas } = html2canvasModule;
  const targetWidthPx = getTargetRenderWidthPx(orientation);
  const effectiveScale = resolveNativeCaptureScale(
    scale,
    targetWidthPx,
    bandHeightPx,
  );

  // Always rasterize at the A4 content width. Using clone.scrollWidth made wide
  // tables allocate canvases far larger than the clipped host and OOM on Android.
  return html2canvas(clipHost, {
    scale: effectiveScale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    width: targetWidthPx,
    height: bandHeightPx,
    windowWidth: targetWidthPx,
    windowHeight: bandHeightPx,
    imageTimeout: isCapacitorNativeApp() ? 8_000 : 15_000,
    removeContainer: true,
  });
}

type CaptureBandOptions = {
  maxBandHeightPx?: number;
};

type BandConsumer = (band: HTMLCanvasElement) => Promise<void>;

/**
 * Capture a mounted clone in vertical bands so Android WebViews never allocate
 * one enormous canvas (the main cause of intermittent native PDF failures).
 * Each band is handed to `onBand` immediately so callers can encode+release it.
 */
async function captureMountedCloneBands(
  host: HTMLElement,
  clone: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  html2canvasModule: typeof import("html2canvas"),
  onBand: BandConsumer,
  bandOptions?: CaptureBandOptions,
): Promise<number> {
  const totalHeight = Math.max(clone.scrollHeight, clone.offsetHeight, 1);
  const maxBandHeight = isCapacitorNativeApp()
    ? bandOptions?.maxBandHeightPx ?? NATIVE_PDF_MAX_BAND_HEIGHT_PX
    : Math.max(totalHeight, 1);

  let bandCount = 0;
  const previousHostOverflow = host.style.overflow;
  const previousHostHeight = host.style.height;
  const previousCloneMarginTop = clone.style.marginTop;

  host.style.overflow = "hidden";

  try {
    for (let offsetY = 0; offsetY < totalHeight; offsetY += maxBandHeight) {
      const bandHeight = Math.min(maxBandHeight, totalHeight - offsetY);
      host.style.height = `${bandHeight}px`;
      clone.style.marginTop = offsetY === 0 ? "0px" : `-${offsetY}px`;

      // Let layout settle before rasterizing each band.
      await yieldToUi(16);

      const band = await renderPdfCanvasBand(
        host,
        orientation,
        scale,
        bandHeight,
        html2canvasModule,
      );
      try {
        await onBand(band);
        bandCount += 1;
      } finally {
        releaseCanvas(band);
      }

      if (offsetY + maxBandHeight < totalHeight) {
        await yieldToUi(isCapacitorNativeApp() ? 80 : 50);
      }
    }
    return bandCount;
  } finally {
    host.style.overflow = previousHostOverflow;
    host.style.height = previousHostHeight;
    clone.style.marginTop = previousCloneMarginTop;
  }
}

type PdfPackState = {
  pdf: import("jspdf").jsPDF;
  orientation: "portrait" | "landscape";
  jpegQuality: number;
  /** Y position (mm from page top) for the next draw. */
  cursorYMm: number;
};

async function createPdfPackState(
  orientation: "portrait" | "landscape",
  jpegQuality: number,
  documentTitle?: string,
): Promise<PdfPackState> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });
  applyPdfDocumentTitle(pdf, documentTitle);
  return {
    pdf,
    orientation,
    jpegQuality,
    cursorYMm: DEFAULT_MARGIN_MM,
  };
}

async function captureElementIntoPdf(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  includeEvidencePages: boolean,
  jpegQuality: number,
  documentTitle: string | undefined,
  existingPdf: import("jspdf").jsPDF | null,
  packState?: PdfPackState | null,
): Promise<{ pdf: import("jspdf").jsPDF; packState: PdfPackState }> {
  const clone = element.cloneNode(true) as HTMLElement;
  const host = document.createElement("div");
  const targetWidthPx = getTargetRenderWidthPx(orientation);

  host.style.position = "fixed";
  // Off-screen + visible: some Android WebViews skip painting opacity:0 nodes,
  // which made html2canvas succeed with a blank/failed canvas.
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${targetWidthPx}px`;
  host.style.background = "#fff";
  host.style.pointerEvents = "none";
  host.style.opacity = "1";
  host.style.zIndex = "-1";
  host.style.overflow = "hidden";
  host.classList.add("pdf-generation-mode");

  clone.classList.add("pdf-generation-mode", "report-export-root");
  clone.style.width = `${targetWidthPx}px`;
  clone.style.maxWidth = `${targetWidthPx}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.fontSize = "14px";
  clone.style.overflow = "visible";

  prepareEvidenceMarkupForPdf(clone, includeEvidencePages);
  fitWideTablesForPdf(clone);

  host.appendChild(clone);
  document.body.appendChild(host);

  // Measure after mount so overflow scale uses real layout width.
  fitCloneToPageWidth(clone, targetWidthPx);

  const html2canvasPromise = import("html2canvas");
  let state: PdfPackState | null = packState ?? null;
  // Legacy: existing PDF without a shared cursor — continue on a fresh page.
  if (!state && existingPdf) {
    existingPdf.addPage("a4", orientation);
    state = {
      pdf: existingPdf,
      orientation,
      jpegQuality,
      cursorYMm: DEFAULT_MARGIN_MM,
    };
  }
  let capturedBands = 0;

  const consumeBand: BandConsumer = async (band) => {
    if (!state) {
      state = await createPdfPackState(
        orientation,
        jpegQuality,
        documentTitle,
      );
    }
    await appendCanvasToPackState(state, band);
    capturedBands += 1;
  };

  try {
    await prepareImagesForPdfCapture(clone);
    const html2canvasModule = await html2canvasPromise;

    try {
      await captureMountedCloneBands(
        host,
        clone,
        orientation,
        scale,
        html2canvasModule,
        consumeBand,
      );
    } catch (firstError) {
      // Only retry when no pages were written — otherwise we'd duplicate bands.
      if (!isCapacitorNativeApp() || capturedBands > 0) {
        throw firstError;
      }

      const fallbackScale = Math.min(scale, NATIVE_PDF_FALLBACK_SCALE);
      console.warn(
        "[pdf] Native capture failed, retrying with lower scale / no images:",
        firstError,
      );
      stripImagesForNativeFallback(clone);
      await captureMountedCloneBands(
        host,
        clone,
        orientation,
        fallbackScale,
        html2canvasModule,
        consumeBand,
        { maxBandHeightPx: Math.floor(NATIVE_PDF_MAX_BAND_HEIGHT_PX * 0.65) },
      );
    }
  } finally {
    host.remove();
  }

  if (!state || capturedBands < 1) {
    throw new Error("PDF capture produced no pages");
  }
  return { pdf: state.pdf, packState: state };
}

function listPdfCaptureNodes(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>(".pdf-page-node, .report-footer"),
  ).filter((node) => !nodesHasPdfPageAncestor(node, element));
}

/** Native: capture each `.pdf-page-node`, pack onto shared page cursor, free canvases. */
async function buildPdfFromSegmentedCapture(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  jpegQuality: number,
  documentTitle: string | undefined,
  includeEvidencePages: boolean,
): Promise<import("jspdf").jsPDF | null> {
  const nodes = listPdfCaptureNodes(element);
  if (nodes.length < 2) return null;

  let packState: PdfPackState | null = null;
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    // Small vertical gap between packed sections on the same page.
    if (packState && i > 0) {
      packState.cursorYMm += 3;
    }
    try {
      const result = await captureElementIntoPdf(
        node,
        orientation,
        scale,
        includeEvidencePages,
        jpegQuality,
        documentTitle,
        packState?.pdf ?? null,
        packState,
      );
      packState = result.packState;
    } catch (error) {
      console.error("[pdf] Segment capture failed", {
        nodeIndex: i,
        nodeCount: nodes.length,
        className: node.className,
        scrollHeight: node.scrollHeight,
        detail: error instanceof Error ? error.message : String(error),
      });
      // Never fall back to one full-report canvas on native — that path OOMs.
      throw new Error(
        `PDF capture failed on section ${i + 1} of ${nodes.length}. Try exporting without photo evidence or with a shorter report.`,
      );
    }
    await yieldToUi(isCapacitorNativeApp() ? 120 : 50);
  }
  return packState?.pdf ?? null;
}

function nodesHasPdfPageAncestor(node: HTMLElement, root: HTMLElement) {
  let parent = node.parentElement;
  while (parent && parent !== root) {
    if (parent.classList.contains("pdf-page-node")) return true;
    parent = parent.parentElement;
  }
  return false;
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
  const state = await createPdfPackState(
    orientation,
    jpegQuality,
    documentTitle,
  );
  await appendCanvasToPackState(state, canvas);
  return state.pdf;
}

/** Minimum leftover space (mm) worth packing into before starting a new page. */
const MIN_PACK_REMAINING_MM = 14;

/**
 * Draw a canvas into the PDF, continuing on the current page when leftover
 * space is useful — avoids one-section-per-page blank gaps in segmented capture.
 */
async function appendCanvasToPackState(
  state: PdfPackState,
  canvas: HTMLCanvasElement,
) {
  const page = getPageSizeMm(state.orientation);
  const contentWidthMm = page.width - DEFAULT_MARGIN_MM * 2;
  const contentBottomMm = page.height - DEFAULT_MARGIN_MM;
  const pxPerMm = canvas.width / contentWidthMm;

  let renderedHeightPx = 0;

  while (renderedHeightPx < canvas.height) {
    let remainingMm = contentBottomMm - state.cursorYMm;

    if (remainingMm < MIN_PACK_REMAINING_MM) {
      state.pdf.addPage("a4", state.orientation);
      state.cursorYMm = DEFAULT_MARGIN_MM;
      remainingMm = contentBottomMm - state.cursorYMm;
    }

    const remainingContentPx = canvas.height - renderedHeightPx;
    const maxSlicePx = Math.max(1, Math.floor(remainingMm * pxPerMm));
    const sliceHeightPx = Math.min(maxSlicePx, remainingContentPx);

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

    const sliceHeightMm = sliceHeightPx / pxPerMm;
    state.pdf.addImage(
      canvasToJpegDataUrl(sliceCanvas, state.jpegQuality),
      "JPEG",
      DEFAULT_MARGIN_MM,
      state.cursorYMm,
      contentWidthMm,
      sliceHeightMm,
      undefined,
      "FAST",
    );

    state.cursorYMm += sliceHeightMm;
    renderedHeightPx += sliceHeightPx;
    releaseCanvas(sliceCanvas);

    if (
      state.cursorYMm >= contentBottomMm - 0.5 &&
      renderedHeightPx < canvas.height
    ) {
      state.pdf.addPage("a4", state.orientation);
      state.cursorYMm = DEFAULT_MARGIN_MM;
    }
  }
  releaseCanvas(canvas);
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
  /** Native file:// URI when available (for Share sheet). */
  fileUri?: string;
  /** Cache-relative path for ReportPdf.shareFile fallback. */
  cachePath?: string;
};

/** Short native-save confirmation for alerts. */
export function formatPdfSavedMessage(savedPathLabel: string): string {
  const folder = savedPathLabel.startsWith("Download/")
    ? "Downloads"
    : savedPathLabel.startsWith("Documents/")
      ? "Documents"
      : "app storage";
  const fileName = savedPathLabel.split("/").pop() || "report.pdf";
  if (folder === "app storage") {
    return `PDF saved: ${fileName}\nUse the share sheet to save it to Downloads or send it to another app.`;
  }
  return `PDF saved: ${fileName}\nFind it under Files → ${folder} → ISO Grid`;
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
  return /not implemented|unimplemented|plugin is not implemented|\"Filesystem\"/i.test(message);
}

async function resolveSavedFileUri(
  Filesystem: typeof import("@capacitor/filesystem").Filesystem,
  directory: import("@capacitor/filesystem").Directory,
  path: string
): Promise<string | undefined> {
  try {
    const result = await Filesystem.getUri({ directory, path });
    return typeof result?.uri === "string" && result.uri ? result.uri : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort share sheet so users can find / move the PDF after save.
 * Prefers native ReportPdf.shareFile (FileProvider + ACTION_SEND), then
 * Capacitor Share with a file:// URL in `files` (not content:// / text).
 */
export async function shareSavedPdf(
  fileUri: string,
  filename: string,
  cachePath?: string,
): Promise<boolean> {
  if (cachePath) {
    try {
      const { ReportPdf } = await import("@/lib/capacitor/reportPdf");
      await ReportPdf.shareFile({ path: cachePath });
      return true;
    } catch (error) {
      console.warn("[pdf] ReportPdf.shareFile failed, trying Capacitor Share:", error);
    }
  }

  try {
    const { Share } = await import("@capacitor/share");
    // Capacitor Share only accepts file:// for files — use `files`, not `url`+`text`.
    const fileUrl = fileUri.startsWith("file:")
      ? fileUri
      : fileUri.startsWith("/")
        ? `file://${fileUri}`
        : fileUri;
    await Share.share({
      title: filename,
      files: [fileUrl],
      dialogTitle: "Share PDF",
    });
    return true;
  } catch (error) {
    console.warn("[pdf] Share sheet unavailable:", error);
    return false;
  }
}

async function savePdfBlobOnDevice(
  blob: Blob,
  filename: string,
): Promise<PdfSaveResult> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const safeName = (filename.trim() || "report.pdf").replace(/[^\w.\- ]+/g, "_");
  const relativePath = `${NATIVE_PDF_FOLDER}/${safeName}`;
  const base64 = await blobToBase64(blob);

  const directory = Directory.Cache;
  const label = `Cache/${relativePath}`;
  let lastError: unknown;
  try {
    await Filesystem.writeFile({
      path: relativePath,
      data: base64,
      directory,
      recursive: true,
    });
    const fileUri = await resolveSavedFileUri(Filesystem, directory, relativePath);
    return { savedPathLabel: label, fileUri };
  } catch (error) {
    lastError = error;
    console.warn("[pdf] Could not save to", label, error);
  }

  if (isCapacitorPluginMissing(lastError)) {
    throw new Error(
      "This app build cannot save files on the device. Install the latest APK (v1.5.0 or newer), then try again.",
    );
  }

  throw new Error(
    "Could not save the PDF to app storage. Please try again.",
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
    onProgress,
  } = options || {};

  const withEvidencePages =
    Boolean(includeEvidencePages) && evidencePhotos.length > 0;

  // Native: WebView print pipeline (no html2canvas OOM on long reports).
  if (isCapacitorNativeApp()) {
    try {
      const { generateNativeAuditPdfSave } = await import(
        "@/lib/nativePdfExport"
      );
      const nativeSaved = await generateNativeAuditPdfSave(element, filename, {
        orientation,
        documentTitle,
        includeEvidencePages: withEvidencePages,
        evidencePhotos: withEvidencePages ? evidencePhotos : [],
        filename,
        onProgress,
      });
      if (nativeSaved) {
        return nativeSaved;
      }
      reportPdfProgress(onProgress, {
        stage: "preparing",
        label: "Switching capture mode",
        detail: "Using canvas fallback on this device…",
        percent: 18,
      });
    } catch (error) {
      console.error("[pdf] Native print export failed", error);
      throw error instanceof Error
        ? error
        : new Error("PDF export failed on this device. Please try again.");
    }
  }

  warmPdfGenerationLibs();
  reportPdfProgress(onProgress, {
    stage: "starting",
    label: "Starting export",
    detail: "Loading PDF tools…",
    percent: 8,
  });

  let blob: Blob;
  let stage = "capture";
  try {
    reportPdfProgress(onProgress, {
      stage: "rendering",
      label: "Capturing document",
      detail: "Rendering pages…",
      percent: 35,
    });
    const pdf = await buildAuditReportPdfDocument(
      element,
      orientation,
      scale,
      jpegQuality,
      documentTitle,
      withEvidencePages,
    );

    stage = "pdf assembly";
    if (withEvidencePages) {
      reportPdfProgress(onProgress, {
        stage: "compacting",
        label: "Adding evidence",
        detail: "Appending photo attachment pages…",
        percent: 72,
      });
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        orientation,
        jpegQuality,
      );
    }

    reportPdfProgress(onProgress, {
      stage: "saving",
      label: "Finalizing PDF",
      detail: "Encoding file…",
      percent: 88,
    });
    blob = pdf.output("blob") as Blob;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[pdf] Generation failed", {
      stage,
      native: isCapacitorNativeApp(),
      orientation,
      scale,
      hasEvidence: evidencePhotos.length > 0,
      detail,
    });
    // Preserve actionable capture messages from segmented retries.
    if (
      error instanceof Error &&
      /PDF capture failed|produced no pages/i.test(error.message)
    ) {
      throw error;
    }
    throw new Error(
      stage === "capture"
        ? "PDF capture failed on this device. Try exporting without photo evidence or with a shorter report."
        : "PDF assembly failed on this device. Please try again.",
    );
  }

  try {
    reportPdfProgress(onProgress, {
      stage: "saving",
      label: "Saving PDF",
      detail: isCapacitorNativeApp()
        ? "Writing to device storage…"
        : "Starting download…",
      percent: 94,
    });
    const saved = await deliverPdfBlob(blob, filename);
    reportPdfProgress(onProgress, {
      stage: "done",
      label: "PDF ready",
      percent: 100,
    });
    return saved;
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

  const withEvidencePages =
    Boolean(includeEvidencePages) && evidencePhotos.length > 0;

  if (isCapacitorNativeApp()) {
    const { generateNativeAuditPdfBlob } = await import(
      "@/lib/nativePdfExport"
    );
    const nativeBlob = await generateNativeAuditPdfBlob(element, {
      orientation,
      documentTitle,
      includeEvidencePages: withEvidencePages,
      evidencePhotos: withEvidencePages ? evidencePhotos : [],
    });
    if (nativeBlob) return nativeBlob;
  }

  warmPdfGenerationLibs();

  try {
    const pdf = await buildAuditReportPdfDocument(
      element,
      orientation,
      scale,
      jpegQuality,
      documentTitle,
      withEvidencePages,
    );

    if (withEvidencePages) {
      await appendEvidencePagesToPdf(
        pdf,
        evidencePhotos,
        orientation,
        jpegQuality,
      );
    }

    return pdf.output("blob") as Blob;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[pdf] Failed to generate PDF blob. Details:", errorMessage, error);
    throw new Error(`Failed to generate PDF: ${errorMessage}. Please try again.`);
  }
}

/**
 * Native: segment by `.pdf-page-node`, stream each section into the PDF.
 * Web: single (or banded) capture, then stream canvases into the PDF.
 */
async function buildAuditReportPdfDocument(
  element: HTMLElement,
  orientation: "portrait" | "landscape",
  scale: number,
  jpegQuality: number,
  documentTitle: string | undefined,
  includeEvidencePages: boolean,
): Promise<import("jspdf").jsPDF> {
  if (isCapacitorNativeApp()) {
    const segmented = await buildPdfFromSegmentedCapture(
      element,
      orientation,
      scale,
      jpegQuality,
      documentTitle,
      includeEvidencePages,
    );
    if (segmented) return segmented;
  }

  const result = await captureElementIntoPdf(
    element,
    orientation,
    scale,
    includeEvidencePages,
    jpegQuality,
    documentTitle,
    null,
  );
  return result.pdf;
}
