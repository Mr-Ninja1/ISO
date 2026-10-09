"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { PdfExportProgressCard } from "@/components/forms/PdfExportProgressCard";
import {
  buildAuditPdfFilename,
  formatPdfSavedMessage,
  generateAuditReportPdf,
  prefersNativePdfSave,
  shareSavedPdf,
  warmPdfGenerationLibs,
  type PdfOrientation,
} from "@/lib/pdfGenerator";
import {
  PDF_EXPORT_WEBSITE_TIP_AFTER_MS,
  type PdfExportProgress,
} from "@/lib/pdfExportProgress";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

type Props = {
  formTitle: string;
  tenantSlug?: string;
  evidencePhotos?: ReportEvidencePhoto[];
  defaultOrientation?: PdfOrientation;
};

const INITIAL_PROGRESS: PdfExportProgress = {
  stage: "starting",
  label: "Starting export",
  detail: "Getting things ready…",
  percent: 2,
};

export function PdfGeneratorButton({
  formTitle,
  tenantSlug,
  evidencePhotos = [],
  defaultOrientation = "landscape",
}: Props) {
  const filename = buildAuditPdfFilename(formTitle, tenantSlug);
  const documentTitle = formTitle.trim() || "Form report";
  const nativeSave = prefersNativePdfSave();
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orientation, setOrientation] =
    useState<PdfOrientation>(defaultOrientation);
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [progress, setProgress] = useState<PdfExportProgress>(INITIAL_PROGRESS);
  const [showWebsiteTip, setShowWebsiteTip] = useState(false);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    warmPdfGenerationLibs();
  }, []);

  useEffect(() => {
    return () => {
      if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    };
  }, []);

  const clearTipTimer = useCallback(() => {
    if (tipTimerRef.current) {
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
  }, []);

  const beginProgressUi = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
    setShowWebsiteTip(false);
    clearTipTimer();
    if (nativeSave) {
      tipTimerRef.current = setTimeout(() => {
        setShowWebsiteTip(true);
      }, PDF_EXPORT_WEBSITE_TIP_AFTER_MS);
    }
  }, [clearTipTimer, nativeSave]);

  const endProgressUi = useCallback(() => {
    clearTipTimer();
    setShowWebsiteTip(false);
    setGenerating(false);
  }, [clearTipTimer]);

  const hasEvidence = evidencePhotos.length > 0;

  async function runExport(
    includeEvidencePages: boolean,
    orient: PdfOrientation,
  ) {
    const element = document.getElementById("report-content");
    if (!element) {
      throw new Error("Report content not found");
    }

    const saved = await generateAuditReportPdf(element, filename, {
      orientation: orient,
      includeEvidencePages,
      evidencePhotos: includeEvidencePages ? evidencePhotos : [],
      documentTitle,
      onProgress: (next) => setProgress(next),
    });
    if (saved?.savedPathLabel) {
      // Open share first — alert() blocks and previously hid a failed share behind OK.
      let shared = false;
      if (saved.fileUri || saved.cachePath) {
        shared = await shareSavedPdf(
          saved.fileUri || "",
          filename,
          saved.cachePath,
        ).catch(() => false);
      }
      alert(
        shared
          ? formatPdfSavedMessage(saved.savedPathLabel)
          : `${formatPdfSavedMessage(saved.savedPathLabel)}\n\n(Share sheet could not be opened — use Files → Downloads → ISO Grid.)`,
      );
    }
  }

  async function handleConfirmExport() {
    if (generating) return;
    setGenerating(true);
    setDialogOpen(false);
    beginProgressUi();
    try {
      await runExport(hasEvidence ? includeEvidence : false, orientation);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      const message =
        error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to generate PDF. Please try again.";
      alert(message);
    } finally {
      endProgressUi();
    }
  }

  function openExportFlow() {
    if (generating) return;
    if (hasEvidence) {
      setIncludeEvidence(true);
      setOrientation(defaultOrientation);
      setDialogOpen(true);
      return;
    }
    void (async () => {
      setGenerating(true);
      beginProgressUi();
      try {
        await runExport(false, defaultOrientation);
      } catch (error) {
        console.error("Failed to generate PDF:", error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Failed to generate PDF. Please try again.";
        alert(message);
      } finally {
        endProgressUi();
      }
    })();
  }

  return (
    <>
      <button
        type="button"
        onClick={openExportFlow}
        disabled={generating}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm disabled:opacity-60 hover:bg-foreground/5"
        title="Download as PDF"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {generating ? "Generating…" : nativeSave ? "Save PDF" : "Download PDF"}
      </button>

      {generating ? (
        <PdfExportProgressCard
          progress={progress}
          showWebsiteTip={showWebsiteTip}
          formTitle={formTitle}
        />
      ) : null}

      {dialogOpen && hasEvidence ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 print:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close export options"
            onClick={() => !generating && setDialogOpen(false)}
          />
          <div
            className="relative w-full max-w-md rounded-xl border border-foreground/20 bg-background p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-export-title"
          >
            <h2 id="pdf-export-title" className="text-lg font-semibold">
              Export PDF
            </h2>
            <p className="mt-1 text-sm text-foreground/70">
              This form has {evidencePhotos.length} evidence photo
              {evidencePhotos.length === 1 ? "" : "s"}. Include full-size
              attachment pages for auditing?
            </p>

            <div className="mt-4 grid gap-3">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Evidence photos</legend>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-foreground/15 p-3 hover:bg-foreground/[0.03]">
                  <input
                    type="radio"
                    name="evidence-mode"
                    checked={includeEvidence}
                    onChange={() => setIncludeEvidence(true)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">
                      With evidence attachments
                    </span>
                    <span className="mt-0.5 block text-foreground/65">
                      Each photo on its own page under &quot;Evidence
                      attachments&quot;, sized for review.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-foreground/15 p-3 hover:bg-foreground/[0.03]">
                  <input
                    type="radio"
                    name="evidence-mode"
                    checked={!includeEvidence}
                    onChange={() => setIncludeEvidence(false)}
                    className="mt-1"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Form only</span>
                    <span className="mt-0.5 block text-foreground/65">
                      Summary pages only (thumbnails omitted from export).
                    </span>
                  </span>
                </label>
              </fieldset>

              <label className="grid gap-1 text-sm">
                <span className="font-medium">Page orientation</span>
                <select
                  value={orientation}
                  onChange={(e) =>
                    setOrientation(e.target.value as PdfOrientation)
                  }
                  className="h-10 rounded-md border border-foreground/20 bg-background px-3"
                >
                  <option value="landscape">Landscape (A4)</option>
                  <option value="portrait">Portrait (A4)</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-md border border-foreground/20 px-4 text-sm hover:bg-foreground/5"
                disabled={generating}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-60"
                disabled={generating}
                onClick={() => void handleConfirmExport()}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
