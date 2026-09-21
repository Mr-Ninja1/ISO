"use client";

import { useEffect, useState } from "react";
import { LayoutTemplate, Sparkles, Wand2 } from "lucide-react";

type Props = {
  onChooseAi: () => void;
  onChooseManual: () => void;
};

export function FormBuilderModeChooser({ onChooseAi, onChooseManual }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative min-h-[calc(100dvh-4.5rem)] overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% 0%, color-mix(in srgb, var(--hse-sky) 55%, transparent), transparent 55%), radial-gradient(ellipse 70% 45% at 90% 10%, color-mix(in srgb, var(--hse-teal) 12%, transparent), transparent 50%), linear-gradient(180deg, color-mix(in srgb, var(--hse-cream) 40%, white), var(--background))",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: "color-mix(in srgb, var(--hse-sky-deep) 35%, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-10 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "color-mix(in srgb, var(--hse-teal) 18%, transparent)" }}
      />

      <div
        className={
          "relative mx-auto max-w-4xl transition-all duration-500 ease-out " +
          (visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--hse-teal)_22%,transparent)] bg-[color-mix(in_srgb,var(--hse-teal)_6%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--hse-teal)]">
            <Wand2 className="h-3.5 w-3.5" />
            New form
          </div>
          <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            How do you want to build?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-foreground/65 sm:text-base">
            Most teams start with AI — attach a PDF or photo, or describe what you need. Switch to manual anytime for exact control.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5">
          <button
            type="button"
            onClick={onChooseAi}
            className={
              "group relative overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--hse-teal)_28%,transparent)] " +
              "bg-[color-mix(in_srgb,var(--hse-teal)_7%,white)] p-5 text-left shadow-sm transition-all duration-300 " +
              "hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--hse-teal)_45%,transparent)] hover:shadow-md " +
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hse-teal)] " +
              "sm:p-6 " +
              (visible ? "delay-75" : "")
            }
          >
            <div
              aria-hidden
              className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-60 transition-transform duration-500 group-hover:scale-110"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--hse-teal) 22%, transparent), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="rounded-md bg-[var(--hse-teal)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Recommended
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-foreground">AI form builder</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                Upload a PDF or photo of an existing form, or describe the fields you need. AI drafts a working form that captures the same important information.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-foreground/60">
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-[var(--hse-teal)]" />
                  PDF, JPG, or PNG attach
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-[var(--hse-teal)]" />
                  Or type a short prompt
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-[var(--hse-teal)]" />
                  Edit the draft after generation
                </li>
              </ul>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--hse-teal)]">
                Start with AI
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onChooseManual}
            className={
              "group relative overflow-hidden rounded-2xl border border-foreground/15 bg-background/90 p-5 text-left " +
              "shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/25 hover:bg-background hover:shadow-md " +
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40 " +
              "sm:p-6"
            }
          >
            <div
              aria-hidden
              className="absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-50"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--hse-sky-deep) 40%, transparent), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.03] text-foreground">
                <LayoutTemplate className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-foreground">Manual builder</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/70">
                Start from a blank canvas. Drag fields, tables, signatures, and sections into place when you want full control of the layout.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-foreground/60">
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-foreground/40" />
                  Blank canvas toolkit
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-foreground/40" />
                  Exact field and table control
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-foreground/40" />
                  Works fully offline once cached
                </li>
              </ul>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-foreground/80">
                Build manually
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
