"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Hand,
  Sparkles,
  Table2,
  Thermometer,
  X,
} from "lucide-react";
import type { FormSection } from "@/types/forms";
import type { AiExtractionSummary } from "@/lib/ai/types";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: FormSection[];
  extraction?: AiExtractionSummary | null;
  className?: string;
};

function countStructure(sections: FormSection[]) {
  let fields = 0;
  let grids = 0;
  let columns = 0;
  let tempBounds = 0;
  let signatures = 0;
  let staticCols = 0;

  for (const section of sections) {
    if (section.type === "fields") {
      for (const field of section.fields) {
        if (field.isActive === false) continue;
        fields += 1;
        if (field.type === "temp") {
          const t = field as { alertAbove?: number; alertBelow?: number; min?: number; max?: number };
          if (
            typeof t.alertAbove === "number" ||
            typeof t.alertBelow === "number" ||
            typeof t.min === "number" ||
            typeof t.max === "number"
          ) {
            tempBounds += 1;
          }
        }
        if (field.type === "signature") signatures += 1;
      }
    } else {
      grids += 1;
      for (const col of section.columns) {
        if (col.isActive === false) continue;
        columns += 1;
        if (col.type === "temp") {
          const t = col as { alertAbove?: number; alertBelow?: number };
          if (typeof t.alertAbove === "number" || typeof t.alertBelow === "number") tempBounds += 1;
        }
        if (col.type === "signature") signatures += 1;
        if (col.type === "static") staticCols += 1;
      }
    }
  }

  return { fields, grids, columns, tempBounds, signatures, staticCols };
}

export function AiFormBriefing({
  open,
  onClose,
  title,
  sections,
  extraction,
  className = "",
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => countStructure(sections), [sections]);

  const decisions = useMemo(() => {
    const items: { icon: ReactNode; text: string }[] = [];

    if (extraction?.summary) {
      items.push({ icon: <Sparkles className="h-3.5 w-3.5" />, text: extraction.summary });
    } else {
      items.push({
        icon: <ClipboardList className="h-3.5 w-3.5" />,
        text: `Drafted “${title || "Untitled form"}” with ${stats.fields} field${stats.fields === 1 ? "" : "s"}${
          stats.grids ? ` and ${stats.grids} table${stats.grids === 1 ? "" : "s"}` : ""
        }.`,
      });
    }

    if (stats.grids && stats.columns) {
      items.push({
        icon: <Table2 className="h-3.5 w-3.5" />,
        text: `Kept ${stats.columns} data column${stats.columns === 1 ? "" : "s"} across ${stats.grids} table${
          stats.grids === 1 ? "" : "s"
        } — repeated rows stay editable.`,
      });
    }

    if (stats.tempBounds > 0) {
      items.push({
        icon: <Thermometer className="h-3.5 w-3.5" />,
        text: `Temperature bounds detected on ${stats.tempBounds} control${stats.tempBounds === 1 ? "" : "s"} — out-of-range values will highlight when tested.`,
      });
    }

    if (stats.staticCols > 0 || extraction?.staticColumns?.length) {
      const labels = extraction?.staticColumns?.length
        ? extraction.staticColumns.map((l) => `“${l}”`).join(", ")
        : `${stats.staticCols} static column${stats.staticCols === 1 ? "" : "s"}`;
      items.push({
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        text: `Printed item lists retained as static columns (${labels}) — edit them with Printed items on the table.`,
      });
    }

    if (stats.signatures > 0) {
      items.push({
        icon: <Hand className="h-3.5 w-3.5" />,
        text: `Per-row or footer sign-off preserved (${stats.signatures} signature control${
          stats.signatures === 1 ? "" : "s"
        }).`,
      });
    }

    if (extraction?.adaptations?.length) {
      for (const adaptation of extraction.adaptations.slice(0, 2)) {
        items.push({ icon: <Sparkles className="h-3.5 w-3.5" />, text: adaptation });
      }
    }

    return items.slice(0, 5);
  }, [extraction, stats, title]);

  if (!open) return null;

  return (
    <div
      className={
        "mx-3 mt-3 overflow-hidden rounded-xl border border-foreground/10 " +
        "bg-[color-mix(in_srgb,var(--hse-sky)_12%,white)] shadow-sm " +
        className
      }
    >
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-[var(--hse-teal)] shadow-sm">
          <ClipboardList className="h-3.5 w-3.5" />
        </div>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">AI draft overview</span>
            <ChevronDown
              className={"h-3.5 w-3.5 text-foreground/45 transition-transform " + (expanded ? "rotate-180" : "")}
            />
          </div>
          <p className="truncate text-[11px] text-foreground/55">
            {stats.fields} field{stats.fields === 1 ? "" : "s"}
            {stats.grids ? ` · ${stats.grids} table${stats.grids === 1 ? "" : "s"}` : ""}
            {(extraction?.staticColumns?.length || stats.staticCols)
              ? ` · ${extraction?.staticColumns?.length || stats.staticCols} printed list${(extraction?.staticColumns?.length || stats.staticCols) === 1 ? "" : "s"}`
              : ""}
            {extraction?.summary ? ` · ${extraction.summary}` : " · Review what AI included"}
          </p>
        </button>

        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/45 hover:bg-background/80 hover:text-foreground"
          onClick={onClose}
          aria-label="Dismiss briefing"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <div className="space-y-2.5 border-t border-foreground/8 bg-background/65 px-3 py-3 sm:px-4">
          <ul className="space-y-1.5">
            {decisions.map((item, i) => (
              <li
                key={`${i}-${item.text.slice(0, 24)}`}
                className="flex items-start gap-2 rounded-xl border border-foreground/8 bg-background/80 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/75"
              >
                <span className="mt-0.5 text-[var(--hse-teal)]">{item.icon}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>

          {extraction?.uncertainItems?.length ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="font-medium">Worth a quick look</div>
                <ul className="mt-0.5 list-disc pl-4">
                  {extraction.uncertainItems.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <p className="text-[10px] text-foreground/45">
            Tip: use <span className="font-medium text-foreground/60">Test</span> in the toolbar to try the form, then
            adjust anything in the canvas.
          </p>
        </div>
      ) : null}
    </div>
  );
}
