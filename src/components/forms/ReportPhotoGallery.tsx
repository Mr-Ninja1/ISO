"use client";

import { useEffect, useState } from "react";

export function ReportPhotoGallery({
  photos,
  label,
  pdfSummary,
}: {
  photos: string[];
  label: string;
  pdfSummary?: string;
}) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!previewSrc) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewSrc]);

  if (!photos.length) return null;

  return (
    <div className="report-evidence-block">
      <p className="report-evidence-pdf-note mb-2 hidden text-sm text-foreground/60">
        {pdfSummary ||
          `${photos.length} photo${photos.length === 1 ? "" : "s"} attached for this document. Full-size photo evidence is included below in the Evidence attachments section.`}
      </p>
      <div className="report-evidence-thumb-grid flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <button
            key={`${label}_${index}`}
            type="button"
            className="report-evidence-thumb overflow-hidden rounded-md border border-foreground/20 bg-background shadow-sm transition hover:ring-2 hover:ring-foreground/25"
            onClick={() => setPreviewSrc(photo)}
            title="Tap to view full image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={`${label} ${index + 1}`}
              className="h-20 w-24 object-cover sm:h-24 sm:w-28"
            />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-foreground/55 print:hidden">
        Tap a thumbnail to open full size.
      </p>

      {previewSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 print:hidden"
          onClick={() => setPreviewSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} full size`}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded-md bg-black/80 px-3 py-1.5 text-sm text-white"
              onClick={() => setPreviewSrc(null)}
            >
              Close
            </button>
            <p className="mb-2 text-center text-sm font-medium text-white/90">
              {label}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt={`${label} full`}
              className="max-h-[85vh] w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
