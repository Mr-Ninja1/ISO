"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  FileQuestion,
  LayoutTemplate,
  ListChecks,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import type { FormType } from "@/types/forms";
import { FORM_TYPE_OPTIONS, getFormBuilderConfig } from "@/lib/formBuilderConfig";

const ICONS: Record<FormType, React.ReactNode> = {
  custom: <LayoutTemplate className="h-5 w-5" />,
  checklist: <ListChecks className="h-5 w-5" />,
  questionnaire: <FileQuestion className="h-5 w-5" />,
  "answer-sheet": <ClipboardList className="h-5 w-5" />,
  inspection: <ShieldCheck className="h-5 w-5" />,
  handwritten: <PenLine className="h-5 w-5" />,
};

type Props = {
  value: FormType;
  onChange: (next: FormType) => void;
  disabled?: boolean;
  layout?: "inline" | "modal";
};

export function FormTypePicker({ value, onChange, disabled, layout = "inline" }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedConfig = getFormBuilderConfig(value);

  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(ev: MouseEvent | TouchEvent) {
      const target = ev.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [expanded]);

  function pickType(next: FormType) {
    onChange(next);
    setExpanded(false);
  }

  if (layout === "modal") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {FORM_TYPE_OPTIONS.map((type) => {
          const config = getFormBuilderConfig(type);
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              disabled={disabled}
              onClick={() => pickType(type)}
              className={
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all " +
                (selected
                  ? "border-[var(--hse-teal)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] ring-1 ring-[var(--hse-teal)]"
                  : "border-foreground/15 hover:border-foreground/30 hover:bg-foreground/[0.02]") +
                (disabled ? " cursor-not-allowed opacity-60" : "")
              }
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-foreground/15 bg-background text-foreground/70">
                  {ICONS[type]}
                </span>
                <div>
                  <div className="text-sm font-semibold">{config.label}</div>
                  <div className="text-[11px] text-foreground/55">{config.tagline}</div>
                </div>
              </div>
              <p className="text-xs leading-5 text-foreground/60">{config.description}</p>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="rounded-xl border border-foreground/15 bg-[color-mix(in_srgb,var(--hse-teal)_4%,white)] p-3 shadow-sm">
        <p className="text-xs font-medium text-foreground/55">What form do you want to build?</p>

        <button
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
          className={
            "mt-2 flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors " +
            (expanded
              ? "border-[var(--hse-teal)] ring-1 ring-[var(--hse-teal)]"
              : "border-foreground/15 hover:border-foreground/30") +
            (disabled ? " cursor-not-allowed opacity-60" : "")
          }
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--hse-teal)] bg-white text-[var(--hse-teal)]">
            {ICONS[value]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{selectedConfig.label}</span>
            <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--hse-teal-mid)]">
              {selectedConfig.tagline}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[11px] font-medium text-[var(--hse-teal)]">
              {expanded ? "Close" : "Select form type"}
            </span>
            <ChevronDown
              className={
                "h-4 w-4 text-foreground/50 transition-transform " + (expanded ? "rotate-180" : "")
              }
            />
          </span>
        </button>

        {!expanded ? (
          <p className="mt-2 text-xs leading-5 text-foreground/60">{selectedConfig.description}</p>
        ) : null}
      </div>

      {expanded ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Form type"
          className="absolute left-0 right-0 z-30 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-foreground/15 bg-background p-2 shadow-lg"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {FORM_TYPE_OPTIONS.map((type) => {
              const config = getFormBuilderConfig(type);
              const selected = value === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  role="option"
                  aria-selected={selected}
                  onClick={() => pickType(type)}
                  className={
                    "group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all " +
                    (selected
                      ? "border-[var(--hse-teal)] bg-[color-mix(in_srgb,var(--hse-teal)_8%,white)] shadow-sm ring-1 ring-[var(--hse-teal)]"
                      : "border-foreground/15 bg-background hover:border-foreground/30 hover:bg-foreground/[0.02]") +
                    (disabled ? " cursor-not-allowed opacity-60" : "")
                  }
                >
                  <div className="flex w-full items-center gap-2">
                    <span
                      className={
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border " +
                        (selected
                          ? "border-[var(--hse-teal)] bg-white text-[var(--hse-teal)]"
                          : "border-foreground/15 bg-foreground/[0.03] text-foreground/70")
                      }
                    >
                      {ICONS[type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-foreground">{config.label}</div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--hse-teal-mid)]">
                        {config.tagline}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-5 text-foreground/65">{config.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
