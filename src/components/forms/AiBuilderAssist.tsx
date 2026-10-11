"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Undo2, Redo2, Wand2, X } from "lucide-react";
import type { AiExtractionSummary, AiSuggestedAction } from "@/lib/ai/types";
import { AI_REFINE_PRESETS } from "@/lib/ai/smartLayout";

type Props = {
  open: boolean;
  onClose: () => void;
  extraction?: AiExtractionSummary | null;
  refining: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onLocalAction: (action: AiSuggestedAction) => void;
  onRefine: (instruction: string) => void;
  quotaRemaining?: number | null;
  unlimited?: boolean;
};

export function AiBuilderAssist({
  open,
  onClose,
  extraction,
  refining,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onLocalAction,
  onRefine,
  quotaRemaining,
  unlimited,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!open) setInstruction("");
  }, [open]);

  const chips = useMemo((): AiSuggestedAction[] => {
    const fromExtraction = extraction?.suggestedActions || [];
    if (fromExtraction.length) return fromExtraction;
    return AI_REFINE_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.prompt,
      refinePrompt: preset.prompt,
    }));
  }, [extraction]);

  if (!open) return null;

  return (
    <div className="border-b border-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)] bg-gradient-to-r from-[color-mix(in_srgb,var(--hse-teal)_8%,white)] to-[color-mix(in_srgb,var(--hse-sky)_28%,white)]">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="text-xs font-semibold text-foreground">AI assist</span>
            <span className="truncate text-[11px] text-foreground/55">
              Instant polish · refine in plain language
            </span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-foreground/12 bg-background/90 text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
            disabled={!canUndo || refining}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-foreground/12 bg-background/90 text-foreground/70 hover:bg-foreground/5 disabled:opacity-40"
            disabled={!canRedo || refining}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
            onClick={onClose}
            title="Hide assist"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-2 px-3 pb-3 sm:px-4">
          {extraction?.summary ? (
            <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground/65">{extraction.summary}</p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {chips.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={refining}
                title={action.description}
                onClick={() => {
                  if (action.localAction) {
                    onLocalAction(action);
                    return;
                  }
                  if (action.refinePrompt) {
                    onRefine(action.refinePrompt);
                    return;
                  }
                  if (action.id === "paste_static_items") {
                    onLocalAction(action);
                    return;
                  }
                  onRefine(action.description || action.label);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--hse-teal)_30%,transparent)] bg-background/95 px-3 text-[11px] font-medium text-[var(--hse-teal)] shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--hse-teal)_10%,white)] disabled:opacity-50"
              >
                <Wand2 className="h-3 w-3" />
                {action.label}
              </button>
            ))}
            {AI_REFINE_PRESETS.filter((preset) => !chips.some((c) => c.id === preset.id))
              .slice(0, 2)
              .map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={refining}
                  onClick={() => onRefine(preset.prompt)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-foreground/15 bg-background px-2.5 text-[11px] font-medium text-foreground/70 hover:bg-foreground/5 disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
          </div>

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={refining}
                rows={1}
                placeholder="e.g. Make corrective action full width and add a photo column"
                className="max-h-24 min-h-[36px] w-full resize-y rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs leading-5 focus:border-[var(--hse-teal)] focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (instruction.trim() && !refining) onRefine(instruction.trim());
                  }
                }}
              />
            </div>
            <button
              type="button"
              disabled={refining || !instruction.trim()}
              onClick={() => onRefine(instruction.trim())}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--hse-teal)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Refine
            </button>
          </div>

          {!unlimited && typeof quotaRemaining === "number" ? (
            <p className="text-[10px] text-foreground/45">
              {quotaRemaining} AI generation{quotaRemaining === 1 ? "" : "s"} left this month · instant chips are free
            </p>
          ) : (
            <p className="text-[10px] text-foreground/45">Instant chips are free · Refine uses one AI credit</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
