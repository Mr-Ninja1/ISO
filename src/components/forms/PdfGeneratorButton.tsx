"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { generateAuditReportPdf } from "@/lib/pdfGenerator";
import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

type Props = {
  filename: string;
  evidencePhotos?: ReportEvidencePhoto[];
  defaultOrientation?: "portrait" | "landscape";
};

export function PdfGeneratorButton({
  filename,
  evidencePhotos = [],
  defaultOrientation = "landscape",
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(defaultOrientation);
  const [includeEvidence, setIncludeEvidence] = useState(true);

  const hasEvidence = evidencePhotos.length > 0;

  async function runExport(includeEvidencePages: boolean, orient: "portrait" | "landscape") {
    const element = document.getElementById("report-content");
    if (!element) {
      throw new Error("Report content not found");
    }

    await generateAuditReportPdf(element, filename, {
      scale: 3,
      orientation: orient,
      includeEvidencePages,
      evidencePhotos: includeEvidencePages ? evidencePhotos : [],
    });
  }

  async function handleConfirmExport() {
    if (generating) return;
    setGenerating(true);
    setDialogOpen(false);
    try {
      await runExport(hasEvidence ? includeEvidence : false, orientation);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
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
      try {
        await runExport(false, defaultOrientation);
      } catch (error) {
        console.error("Failed to generate PDF:", error);
        alert("Failed to generate PDF. Please try again.");
      } finally {
        setGenerating(false);
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
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {generating ? "Generating…" : "Download PDF"}
      </button>

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
              {evidencePhotos.length === 1 ? "" : "s"}. Include full-size attachment pages for auditing?
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
                    <span className="font-medium">With evidence attachments</span>
                    <span className="mt-0.5 block text-foreground/65">
                      Each photo on its own page under &quot;Evidence attachments&quot;, sized for review.
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
                  onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape")}
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
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
