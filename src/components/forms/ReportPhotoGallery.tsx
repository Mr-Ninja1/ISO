"use client";

import { useEffect, useState } from "react";

export function ReportPhotoGallery({ photos, label }: { photos: string[]; label: string }) {
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
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <button
            key={`${label}_${index}`}
            type="button"
            className="w-16 overflow-hidden rounded-md border border-foreground/20"
            onClick={() => setPreviewSrc(photo)}
            title="Click to view full image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={`${label} ${index + 1}`} className="h-14 w-16 object-cover" />
          </button>
        ))}
      </div>

      {previewSrc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewSrc(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-h-[90vh] w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs text-white"
              onClick={() => setPreviewSrc(null)}
            >
              Close
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt={`${label} full`} className="max-h-[90vh] w-full rounded-md object-contain" />
          </div>
        </div>
      ) : null}
    </>
  );
}
