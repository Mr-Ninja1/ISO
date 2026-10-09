import { compressImageForPdf, PDF_JPEG_QUALITY } from "@/lib/pdfImageCompression";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  reportPdfProgress,
  type PdfExportProgressCallback,
} from "@/lib/pdfExportProgress";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const NATIVE_PRINT_IMAGE_MAX_PX = 960;
const NATIVE_PRINT_EVIDENCE_MAX_PX = 1280;

export type NativePdfOrientation = "portrait" | "landscape";

export type NativePdfBuildOptions = {
  orientation: NativePdfOrientation;
  documentTitle?: string;
  includeEvidencePages?: boolean;
  evidencePhotos?: ReportEvidencePhoto[];
  filename?: string;
  onProgress?: PdfExportProgressCallback;
};

export type NativePdfSaveResult = {
  savedPathLabel: string;
  fileUri?: string;
  /** Cache-relative path for native shareFile fallback */
  cachePath?: string;
};

function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      // Cross-origin stylesheets are not readable — ignore.
    }
  }
  return chunks.join("\n");
}

function fitWideTablesForPrint(clone: HTMLElement) {
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
    table.style.borderCollapse = "collapse";
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

function prepareEvidenceMarkup(
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

/**
 * Inline every image as a compressed data URL so the print WebView has pixels
 * ready without network fetches (HTML is written to a cache file, not the bridge).
 */
async function prepareImagesForNativePrint(
  root: HTMLElement,
  onProgress?: PdfExportProgressCallback,
) {
  const images = Array.from(root.querySelectorAll("img"));
  const total = images.length;
  if (total === 0) return;

  reportPdfProgress(onProgress, {
    stage: "compacting",
    label: "Compacting images",
    detail: `Optimizing ${total} image${total === 1 ? "" : "s"} for print…`,
    percent: 22,
  });

  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    const src = img.currentSrc || img.getAttribute("src") || img.src;
    if (!src) continue;

    if (i === 0 || (i + 1) % 2 === 0 || i === total - 1) {
      const pct = 22 + Math.round(((i + 1) / total) * 18);
      reportPdfProgress(onProgress, {
        stage: "compacting",
        label: "Compacting images",
        detail: `Image ${i + 1} of ${total}`,
        percent: Math.min(40, pct),
      });
    }

    try {
      const compressed = await compressImageForPdf(
        src,
        NATIVE_PRINT_IMAGE_MAX_PX,
        PDF_JPEG_QUALITY,
      );
      if (!compressed) {
        img.style.display = "none";
        continue;
      }
      img.setAttribute("src", compressed.dataUrl);
      img.removeAttribute("srcset");
      img.removeAttribute("crossorigin");
      if (typeof img.decode === "function") {
        await img.decode().catch(() => undefined);
      }
    } catch {
      img.style.display = "none";
    }
  }
}

async function buildEvidenceHtml(
  photos: ReportEvidencePhoto[],
  onProgress?: PdfExportProgressCallback,
): Promise<string> {
  if (!photos.length) return "";

  reportPdfProgress(onProgress, {
    stage: "compacting",
    label: "Compacting evidence",
    detail: `Preparing ${photos.length} evidence photo${photos.length === 1 ? "" : "s"}…`,
    percent: 42,
  });

  const parts: string[] = [];
  for (let index = 0; index < photos.length; index += 1) {
    const item = photos[index];
    reportPdfProgress(onProgress, {
      stage: "compacting",
      label: "Compacting evidence",
      detail: `Evidence ${index + 1} of ${photos.length}`,
      percent: 42 + Math.round(((index + 1) / photos.length) * 10),
    });
    const compressed = await compressImageForPdf(
      item.src,
      NATIVE_PRINT_EVIDENCE_MAX_PX,
      PDF_JPEG_QUALITY,
    );
    const src = compressed?.dataUrl || "";
    const caption = `${escapeHtml(item.label)} — ${index + 1} of ${photos.length}`;
    parts.push(`
<section class="native-pdf-evidence-page">
  <h2>Evidence attachments</h2>
  <p class="native-pdf-evidence-caption">${caption}</p>
  ${
    src
      ? `<img class="native-pdf-evidence-img" src="${escapeAttr(src)}" alt="" />`
      : `<p class="native-pdf-evidence-missing">Image could not be embedded in this PDF export.</p>`
  }
</section>`);
  }
  return parts.join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** A4 content height (page − margins) used for smart packing measurements. */
function pageContentHeightPx(orientation: NativePdfOrientation): number {
  const pageHeightMm = orientation === "landscape" ? 210 : 297;
  const marginMm = 10;
  return Math.round(((pageHeightMm - marginMm * 2) * 96) / 25.4);
}

function pageContentWidthPx(orientation: NativePdfOrientation): number {
  const pageWidthMm = orientation === "landscape" ? 297 : 210;
  const marginMm = 10;
  return Math.round(((pageWidthMm - marginMm * 2) * 96) / 25.4);
}

/**
 * Pack report blocks onto pages by measured height.
 * Tall sections may split across leftover space; short blocks stay atomic.
 * Soft page breaks are only inserted when a keep-together block won't fit
 * the remaining strip — tall tables fill leftover space instead of blanking it.
 */
function applySmartPagePacking(
  clone: HTMLElement,
  orientation: NativePdfOrientation,
) {
  const pageH = pageContentHeightPx(orientation);
  const gapPx = 12;

  const blocks = Array.from(
    clone.querySelectorAll<HTMLElement>(
      ".report-header-block, .report-section, .report-footer",
    ),
  );

  let usedOnPage = 0;

  for (const block of blocks) {
    const height = Math.ceil(block.getBoundingClientRect().height);
    if (height <= 0) continue;

    const isTall = height > pageH * 0.92;
    const remaining = Math.max(0, pageH - usedOnPage);

    if (isTall) {
      // Fragment across pages so leftover space on the current page is used.
      block.classList.add("pdf-section-may-split");
      block.classList.remove("print-page-break-avoid");
      const spanned = usedOnPage + height;
      usedOnPage = spanned % pageH;
      if (usedOnPage > 0) usedOnPage += gapPx;
      if (usedOnPage >= pageH) usedOnPage = usedOnPage % pageH;
      continue;
    }

    // Short / medium blocks: keep together (don't tear header/cards mid-box).
    block.classList.add("pdf-section-keep-together");
    if (usedOnPage > 0 && height + gapPx > remaining) {
      block.classList.add("pdf-soft-page-break");
      usedOnPage = Math.min(height + gapPx, pageH - 1);
    } else {
      usedOnPage += height + gapPx;
      if (usedOnPage >= pageH) usedOnPage = usedOnPage % pageH;
    }
  }
}

function buildPrintChromeCss(orientation: NativePdfOrientation) {
  return `
@page {
  size: A4 ${orientation};
  margin: 10mm;
}
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff !important;
  color: #000000 !important;
  color-scheme: light;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.pdf-generation-mode,
.pdf-generation-mode * {
  color: #000000 !important;
  background-color: #ffffff !important;
  background-image: none !important;
  border-color: #333333 !important;
}
.pdf-generation-mode .report-cell-signature {
  background-color: #fafafa !important;
}
.pdf-generation-mode .report-footer {
  color: #666666 !important;
}
.pdf-generation-mode .report-evidence-pdf-note {
  color: #444444 !important;
}
.native-pdf-root {
  width: 100%;
  box-sizing: border-box;
}
.native-pdf-evidence-page {
  page-break-before: always;
  break-before: page;
  padding: 4mm 0;
}
.native-pdf-evidence-page h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.native-pdf-evidence-caption {
  margin: 0 0 16px;
  font-size: 12px;
  color: #333;
}
.native-pdf-evidence-img {
  display: block;
  max-width: 100%;
  max-height: 170mm;
  width: auto;
  height: auto;
  margin: 0 auto;
  object-fit: contain;
}
.native-pdf-evidence-missing {
  color: #777;
  font-size: 12px;
}
/* Soft break only when packing decides the next block won't fit leftover space */
.pdf-soft-page-break {
  break-before: page;
  page-break-before: always;
}
/* Default: sections may fragment — unbreakable sections caused blank page gaps */
.pdf-page-node,
.report-section {
  break-inside: auto;
  page-break-inside: auto;
}
.pdf-section-may-split {
  break-inside: auto !important;
  page-break-inside: auto !important;
}
/* Short blocks measured to fit one page stay atomic */
.pdf-section-keep-together {
  break-inside: avoid;
  page-break-inside: avoid;
}
.report-field-card,
.report-cell-signature,
.report-data-table tr,
tr.print-page-break-avoid {
  break-inside: avoid;
  page-break-inside: avoid;
}
.report-section-title {
  break-after: avoid;
  page-break-after: avoid;
}
.report-data-table thead {
  display: table-header-group;
}
.report-data-table tbody {
  display: table-row-group;
}
`;
}

async function serializeReportHtml(
  element: HTMLElement,
  options: NativePdfBuildOptions,
): Promise<string> {
  const onProgress = options.onProgress;
  const includeEvidence = Boolean(
    options.includeEvidencePages && options.evidencePhotos?.length,
  );

  reportPdfProgress(onProgress, {
    stage: "preparing",
    label: "Preparing document",
    detail: "Cloning report layout…",
    percent: 12,
  });

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add(
    "pdf-generation-mode",
    "report-export-root",
    "native-pdf-root",
  );
  clone.removeAttribute("id");

  prepareEvidenceMarkup(clone, includeEvidence);
  fitWideTablesForPrint(clone);

  const contentWidthPx = pageContentWidthPx(options.orientation);
  const host = document.createElement("div");
  // Mount at real print width so packing measurements match the WebView layout.
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${contentWidthPx}px`,
    "overflow:visible",
    "opacity:0",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  clone.style.width = `${contentWidthPx}px`;
  clone.style.maxWidth = `${contentWidthPx}px`;
  clone.style.margin = "0";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await prepareImagesForNativePrint(clone, onProgress);

    reportPdfProgress(onProgress, {
      stage: "layout",
      label: "Optimizing layout",
      detail: "Packing sections onto pages…",
      percent: 54,
    });
    // Force layout, then pack sections intelligently onto pages.
    void clone.offsetHeight;
    applySmartPagePacking(clone, options.orientation);

    const evidenceHtml = includeEvidence
      ? await buildEvidenceHtml(options.evidencePhotos || [], onProgress)
      : "";

    reportPdfProgress(onProgress, {
      stage: "preparing",
      label: "Assembling print file",
      detail: "Building printable HTML…",
      percent: 62,
    });
    const title = escapeHtml(options.documentTitle?.trim() || "Form report");
    const appCss = collectDocumentCss();
    const printCss = buildPrintChromeCss(options.orientation);

    return `<!DOCTYPE html>
<html lang="en" data-theme="hse-pro" style="color-scheme: light;">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${title}</title>
<style>${appCss}</style>
<style>${printCss}</style>
</head>
<body class="pdf-generation-mode" style="background:#ffffff;color:#000000;">
${clone.outerHTML}
${evidenceHtml}
</body>
</html>`;
  } finally {
    host.remove();
  }
}

function isReportPdfPluginMissing(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /not implemented|unimplemented|plugin is not implemented|\"ReportPdf\"|ReportPdf/i.test(
    message,
  );
}

async function writeHtmlSourceFile(html: string): Promise<string> {
  const { Filesystem, Directory, Encoding } = await import(
    "@capacitor/filesystem"
  );
  const path = `ISO Grid/_pdf-source-${Date.now()}.html`;
  await Filesystem.writeFile({
    path,
    data: html,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return path;
}

async function cleanupCachePath(path: string) {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({ path, directory: Directory.Cache });
  } catch {
    // best-effort
  }
}

function base64ToBlob(base64: string, mime = "application/pdf"): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function renderHtmlToNativePdf(
  html: string,
  options: NativePdfBuildOptions,
): Promise<NativePdfSaveResult> {
  const onProgress = options.onProgress;
  const { ReportPdf } = await import("@/lib/capacitor/reportPdf");
  const fileName = (options.filename || "report.pdf").replace(
    /[^\w.\- ]+/g,
    "_",
  );

  reportPdfProgress(onProgress, {
    stage: "rendering",
    label: "Rendering PDF",
    detail: "Writing print source…",
    percent: 70,
  });

  const htmlPath = await writeHtmlSourceFile(html);
  try {
    reportPdfProgress(onProgress, {
      stage: "rendering",
      label: "Rendering PDF",
      detail: "Converting document via system print…",
      percent: 78,
    });
    const result = await ReportPdf.fromHtmlFile({
      htmlPath,
      fileName,
      orientation: options.orientation,
    });
    reportPdfProgress(onProgress, {
      stage: "saving",
      label: "Saving PDF",
      detail: "Writing file to device storage…",
      percent: 92,
    });
    return {
      // Prefer the public Downloads copy when available (visible in Files).
      savedPathLabel: result.downloadsPath
        ? result.downloadsPath
        : `Cache/${result.path}`,
      fileUri: result.uri,
      cachePath: result.path,
    };
  } finally {
    await cleanupCachePath(htmlPath);
  }
}

/**
 * Native-only save path: WebView print → cache PDF file (no html2canvas).
 * Returns null when the plugin is unavailable so callers can fall back.
 */
export async function generateNativeAuditPdfSave(
  element: HTMLElement,
  filename: string,
  options: NativePdfBuildOptions,
): Promise<NativePdfSaveResult | null> {
  if (!isCapacitorNativeApp()) return null;

  const onProgress = options.onProgress;
  try {
    reportPdfProgress(onProgress, {
      stage: "starting",
      label: "Starting export",
      detail: "Setting up native PDF pipeline…",
      percent: 4,
    });
    const html = await serializeReportHtml(element, {
      ...options,
      filename,
    });
    const saved = await renderHtmlToNativePdf(html, { ...options, filename });
    reportPdfProgress(onProgress, {
      stage: "done",
      label: "PDF ready",
      detail: "Opening share options…",
      percent: 100,
    });
    return saved;
  } catch (error) {
    if (isReportPdfPluginMissing(error)) {
      console.warn(
        "[pdf] ReportPdf plugin missing — falling back to canvas capture.",
        error,
      );
      return null;
    }
    console.error("[pdf] Native print PDF failed", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Native PDF export failed. Please try again.",
    );
  }
}

/**
 * Native-only blob path (for share helpers). Reads the printed PDF from cache.
 * Returns null when the plugin is unavailable.
 */
export async function generateNativeAuditPdfBlob(
  element: HTMLElement,
  options: NativePdfBuildOptions,
): Promise<Blob | null> {
  if (!isCapacitorNativeApp()) return null;

  const saved = await generateNativeAuditPdfSave(
    element,
    options.filename || "report.pdf",
    options,
  );
  if (!saved) return null;

  const relativePath = (saved.cachePath || saved.savedPathLabel).replace(
    /^Cache\//,
    "",
  );
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const file = await Filesystem.readFile({
    path: relativePath,
    directory: Directory.Cache,
  });
  const data = typeof file.data === "string" ? file.data : "";
  if (!data) {
    throw new Error("Could not read generated PDF from device storage.");
  }
  return base64ToBlob(data);
}
