"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, ScanSearch, Table2, Binary, Sparkles } from "lucide-react";

export type BlueprintStageId = "scanning" | "table_extraction" | "datatype_inference" | "layout_polish";

export type BlueprintStage = {
  id: BlueprintStageId;
  label: string;
  detail: string;
  icon: ReactNode;
  /** Rough ms until this stage is considered active when auto-advancing */
  atMs: number;
};

export const AI_BLUEPRINT_STAGES: BlueprintStage[] = [
  {
    id: "scanning",
    label: "Scanning",
    detail: "Reading structure, labels, and layout cues",
    icon: <ScanSearch className="h-3.5 w-3.5" />,
    atMs: 0,
  },
  {
    id: "table_extraction",
    label: "Table extraction",
    detail: "Mapping rows, columns, and repeated items",
    icon: <Table2 className="h-3.5 w-3.5" />,
    atMs: 2200,
  },
  {
    id: "datatype_inference",
    label: "Datatype inference",
    detail: "Detecting temps, initials, dates, and checkboxes",
    icon: <Binary className="h-3.5 w-3.5" />,
    atMs: 4800,
  },
  {
    id: "layout_polish",
    label: "Layout polish",
    detail: "Packing fields and preparing your draft",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    atMs: 7800,
  },
];

type Props = {
  active?: boolean;
  /** When true, force the last stage to show as complete */
  complete?: boolean;
  /** Override which stage is active (0-based). When omitted, auto-advances. */
  stageIndex?: number;
  compact?: boolean;
  className?: string;
  title?: string;
};

export function useBlueprintStageIndex(active: boolean, complete = false) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    if (complete) {
      setIndex(AI_BLUEPRINT_STAGES.length - 1);
      return;
    }

    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      let next = 0;
      for (let i = 0; i < AI_BLUEPRINT_STAGES.length; i += 1) {
        if (elapsed >= AI_BLUEPRINT_STAGES[i].atMs) next = i;
      }
      setIndex(next);
    };

    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [active, complete]);

  return complete ? AI_BLUEPRINT_STAGES.length - 1 : index;
}

export function AiBlueprintingLoader({
  active = true,
  complete = false,
  stageIndex,
  compact = false,
  className = "",
  title = "AI blueprinting",
}: Props) {
  const autoIndex = useBlueprintStageIndex(active && stageIndex == null, complete);
  const current = stageIndex ?? autoIndex;

  return (
    <div
      className={
        "overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--hse-teal)_28%,transparent)] " +
        "bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] shadow-sm " +
        className
      }
      role="status"
      aria-live="polite"
      aria-busy={active && !complete}
    >
      <div className={"flex items-center gap-2 " + (compact ? "px-3 py-2" : "px-4 py-3")}>
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
          {complete ? <Check className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {!complete ? (
            <span className="absolute inset-0 animate-ping rounded-xl bg-[var(--hse-teal)] opacity-20" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="truncate text-[11px] text-foreground/60">
            {complete
              ? "Draft ready — opening your briefing"
              : AI_BLUEPRINT_STAGES[current]?.detail || "Working…"}
          </div>
        </div>
      </div>

      <ol className={"space-y-1.5 border-t border-[color-mix(in_srgb,var(--hse-teal)_16%,transparent)] " + (compact ? "px-3 py-2.5" : "px-4 py-3")}>
        {AI_BLUEPRINT_STAGES.map((stage, i) => {
          const done = complete || i < current;
          const isActive = !complete && i === current;
          return (
            <li
              key={stage.id}
              className={
                "flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-all duration-300 " +
                (isActive
                  ? "bg-background/90 shadow-sm ring-1 ring-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)]"
                  : done
                    ? "opacity-80"
                    : "opacity-45")
              }
            >
              <span
                className={
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg " +
                  (done
                    ? "bg-emerald-100 text-emerald-700"
                    : isActive
                      ? "bg-[var(--hse-teal)] text-white"
                      : "bg-foreground/[0.06] text-foreground/50")
                }
              >
                {done ? <Check className="h-3.5 w-3.5" /> : stage.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{stage.label}</span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--hse-teal)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--hse-teal)]" />
                      Active
                    </span>
                  ) : null}
                </div>
                {!compact ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">{stage.detail}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {!complete ? (
        <div className="h-1 overflow-hidden bg-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)]">
          <div
            className="h-full bg-[var(--hse-teal)] transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(96, ((current + 1) / AI_BLUEPRINT_STAGES.length) * 100)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
