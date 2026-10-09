export type PdfExportStage =
  | "starting"
  | "preparing"
  | "compacting"
  | "layout"
  | "rendering"
  | "saving"
  | "done";

export type PdfExportProgress = {
  stage: PdfExportStage;
  label: string;
  detail?: string;
  /** 0–100 */
  percent: number;
};

export type PdfExportProgressCallback = (progress: PdfExportProgress) => void;

export const PDF_EXPORT_STAGES: Array<{
  stage: PdfExportStage;
  label: string;
}> = [
  { stage: "starting", label: "Starting" },
  { stage: "preparing", label: "Preparing" },
  { stage: "compacting", label: "Compacting" },
  { stage: "layout", label: "Layout" },
  { stage: "rendering", label: "Rendering" },
  { stage: "saving", label: "Saving" },
];

/** Show the “faster on website” tip after this many ms on native. */
export const PDF_EXPORT_WEBSITE_TIP_AFTER_MS = 8_000;

export function reportPdfProgress(
  onProgress: PdfExportProgressCallback | undefined,
  progress: PdfExportProgress,
) {
  try {
    onProgress?.(progress);
  } catch {
    // UI callbacks must never break export.
  }
}
