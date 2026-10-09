import { registerPlugin } from "@capacitor/core";

export type ReportPdfFromHtmlFileOptions = {
  /** Path relative to Directory.Cache, e.g. `ISO Grid/_pdf-source.html`. */
  htmlPath: string;
  fileName: string;
  orientation: "portrait" | "landscape";
};

export type ReportPdfFromHtmlFileResult = {
  /** Path relative to Directory.Cache. */
  path: string;
  /** file:// URI for Capacitor Share */
  uri: string;
  /** Present when also copied into public Downloads/ISO Grid */
  downloadsPath?: string;
};

export type ReportPdfShareFileOptions = {
  /** Path relative to Directory.Cache */
  path: string;
};

export interface ReportPdfPlugin {
  fromHtmlFile(
    options: ReportPdfFromHtmlFileOptions,
  ): Promise<ReportPdfFromHtmlFileResult>;
  shareFile(options: ReportPdfShareFileOptions): Promise<{ completed: boolean }>;
}

export const ReportPdf = registerPlugin<ReportPdfPlugin>("ReportPdf");
