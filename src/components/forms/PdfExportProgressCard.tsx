"use client";

import { FileText, Globe2, Loader2 } from "lucide-react";
import {
  PDF_EXPORT_STAGES,
  type PdfExportProgress,
  type PdfExportStage,
} from "@/lib/pdfExportProgress";

const STAGE_ORDER: PdfExportStage[] = PDF_EXPORT_STAGES.map((s) => s.stage);

function stageIndex(stage: PdfExportStage) {
  if (stage === "done") return STAGE_ORDER.length;
  const idx = STAGE_ORDER.indexOf(stage);
  return idx < 0 ? 0 : idx;
}

type Props = {
  progress: PdfExportProgress;
  showWebsiteTip: boolean;
  formTitle?: string;
};

export function PdfExportProgressCard({
  progress,
  showWebsiteTip,
  formTitle,
}: Props) {
  const activeIdx = stageIndex(progress.stage);
  const percent = Math.min(100, Math.max(0, Math.round(progress.percent)));
  const isDone = progress.stage === "done";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center print:hidden"
      role="status"
      aria-live="polite"
      aria-busy={!isDone}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-hidden />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-foreground/15 bg-background shadow-2xl shadow-black/20">
        <div className="h-1 w-full bg-foreground/10">
          <div
            className="h-full bg-foreground transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.04]">
              {isDone ? (
                <FileText className="h-5 w-5 text-foreground" />
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-foreground/80" />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold text-background">
                    {percent}
                  </span>
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
                Exporting PDF
              </p>
              <h2 className="mt-0.5 text-base font-semibold leading-snug text-foreground">
                {progress.label}
              </h2>
              {formTitle ? (
                <p className="mt-0.5 truncate text-xs text-foreground/55">
                  {formTitle}
                </p>
              ) : null}
            </div>
          </div>

          {progress.detail ? (
            <p className="mt-3 text-sm leading-relaxed text-foreground/70">
              {progress.detail}
            </p>
          ) : null}

          <ol className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {PDF_EXPORT_STAGES.map((item, idx) => {
              const done = idx < activeIdx || isDone;
              const current = idx === activeIdx && !isDone;
              return (
                <li
                  key={item.stage}
                  className={
                    "rounded-lg border px-1.5 py-2 text-center transition-colors " +
                    (done
                      ? "border-foreground/25 bg-foreground/[0.06]"
                      : current
                        ? "border-foreground/35 bg-foreground/[0.04]"
                        : "border-foreground/10 bg-transparent")
                  }
                >
                  <span
                    className={
                      "block text-[9px] font-semibold uppercase tracking-wide " +
                      (done || current
                        ? "text-foreground"
                        : "text-foreground/40")
                    }
                  >
                    {item.label}
                  </span>
                  <span
                    className={
                      "mt-1 mx-auto block h-1 w-1 rounded-full " +
                      (done
                        ? "bg-foreground"
                        : current
                          ? "animate-pulse bg-foreground/70"
                          : "bg-foreground/20")
                    }
                  />
                </li>
              );
            })}
          </ol>

          {showWebsiteTip ? (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-foreground/15 bg-background">
                <Globe2 className="h-3.5 w-3.5 text-foreground/70" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Need it faster?
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground/65">
                  PDF generation is quicker on the website. For speed exports or
                  sharing forms, open this submission in a browser and export
                  from there.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
