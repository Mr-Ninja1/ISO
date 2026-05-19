"use client";

import {
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
};

export function FormTypePicker({ value, onChange, disabled }: Props) {
  return (
    <div role="listbox" aria-label="Form type" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {FORM_TYPE_OPTIONS.map((type) => {
        const config = getFormBuilderConfig(type);
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onChange(type)}
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
  );
}
