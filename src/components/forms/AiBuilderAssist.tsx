"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Loader2, Sparkles, Undo2, Redo2, Wand2, X } from "lucide-react";
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
  const [showAllActions, setShowAllActions] = useState(false);

  useEffect(() => {
    if (!open) {
      setInstruction("");
      setShowAllActions(false);
    }
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

  const visibleChips = showAllActions ? chips : chips.slice(0, 4);
  const fallbackPresets = AI_REFINE_PRESETS.filter((preset) => !chips.some((chip) => chip.id === preset.id)).slice(0, 2);

  if (!open) return null;

  return (
    <section className="mx-3 mt-3 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--hse-teal)_5%,white)] via-background to-[color-mix(in_srgb,var(--hse-sky)_14%,white)] shadow-sm sm:mx-4">
      <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span className="text-sm font-semibold tracking-tight text-foreground">AI form copilot</span>
            <span className="truncate text-[11px] text-foreground/55">Describe a change in plain language</span>
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
        <div className="border-t border-foreground/8 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          <div className="flex items-start gap-2 rounded-xl border border-foreground/8 bg-background/80 px-3 py-2.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)]" />
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground/70">
              {extraction?.summary || "I can add or adjust fields, reorganize sections, and polish the layout. What would you like to change?"}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/45">Try</span>
            {visibleChips.map((action) => (
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
            {fallbackPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={refining}
                onClick={() => onRefine(preset.prompt)}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-foreground/12 bg-background px-3 text-[11px] font-medium text-foreground/65 hover:bg-foreground/5 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
            {chips.length > 4 ? (
              <button
                type="button"
                className="inline-flex h-7 items-center rounded-full px-2 text-[11px] font-medium text-foreground/55 hover:bg-foreground/5 hover:text-foreground"
                onClick={() => setShowAllActions((value) => !value)}
                aria-expanded={showAllActions}
              >
                {showAllActions ? "Fewer ideas" : `More ideas (${chips.length - 4})`}
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex items-end gap-1.5 rounded-xl border border-foreground/15 bg-background p-1.5 shadow-sm focus-within:border-[color-mix(in_srgb,var(--hse-teal)_42%,transparent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)]">
            <div className="min-w-0 flex-1 px-1">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={refining}
                rows={1}
                placeholder="Ask AI to change this form…"
                aria-label="Describe a form change"
                className="max-h-24 min-h-[38px] w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-5 placeholder:text-foreground/40 focus:outline-none disabled:opacity-60"
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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--hse-teal)] text-white shadow-sm hover:opacity-90 disabled:opacity-40"
              aria-label="Refine form with AI"
              title="Refine form"
            >
              {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
            <p className="text-[10px] text-foreground/45">Enter to send · Shift+Enter for a new line</p>
            {!unlimited && typeof quotaRemaining === "number" ? (
              <p className="text-[10px] text-foreground/45">
                {quotaRemaining} AI generation{quotaRemaining === 1 ? "" : "s"} left · quick actions are free
              </p>
            ) : (
              <p className="text-[10px] text-foreground/45">Quick actions are free · refinements use one AI credit</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
