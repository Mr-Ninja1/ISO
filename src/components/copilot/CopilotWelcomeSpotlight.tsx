"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";
import { DC_AI_NAME } from "@/lib/ai/deepControl";
import { Z_COPILOT_SPOTLIGHT } from "@/lib/ui/zIndex";
import type { SpotlightAction, SpotlightWelcome } from "@/lib/copilot/welcomeSpotlight";

type Props = {
  welcome: SpotlightWelcome;
  onAction: (action: SpotlightAction) => void;
  onOpenChat: () => void;
  onDismiss: () => void;
};

export function CopilotWelcomeSpotlight({ welcome, onAction, onOpenChat, onDismiss }: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-0 flex items-center justify-center p-4 sm:p-6 print:hidden"
      style={{ zIndex: Z_COPILOT_SPOTLIGHT }}
      role="dialog"
      aria-modal="false"
      aria-labelledby="copilot-spotlight-title"
      aria-describedby="copilot-spotlight-pitch"
    >
      <div className="copilot-spotlight pointer-events-auto w-full max-w-[min(100vw-2rem,26rem)] copilot-spotlight-enter">
        <div className="relative overflow-hidden rounded-2xl border-2 border-[color-mix(in_srgb,var(--hse-teal)_40%,transparent)] bg-background shadow-[0_24px_80px_rgba(0,61,51,0.22)] ring-1 ring-black/5">
          <div
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[color-mix(in_srgb,var(--hse-teal)_14%,white)] to-transparent"
            aria-hidden
          />

          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground/50 shadow-sm hover:text-foreground"
            aria-label="Dismiss assistant welcome"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--hse-teal)] text-white shadow-lg shadow-[color-mix(in_srgb,var(--hse-teal)_35%,transparent)]">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--hse-teal)]">
                  {welcome.subtitle}
                </p>
                <h2 id="copilot-spotlight-title" className="mt-0.5 text-lg font-bold leading-tight text-foreground">
                  {welcome.title}
                </h2>
              </div>
            </div>

            <p id="copilot-spotlight-pitch" className="mt-3 text-sm leading-relaxed text-foreground/75">
              {welcome.pitch}
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {welcome.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => onAction(action)}
                  className="copilot-spotlight__action group rounded-xl border border-[color-mix(in_srgb,var(--hse-teal)_16%,transparent)] bg-[color-mix(in_srgb,var(--hse-sky)_40%,white)] p-3 text-left transition hover:border-[var(--hse-teal)] hover:bg-[color-mix(in_srgb,var(--hse-sky)_70%,white)]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--hse-charcoal)]">{action.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--hse-teal)] opacity-0 transition group-hover:opacity-100" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-foreground/60">{action.description}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onOpenChat}
                className="ws-btn-primary inline-flex h-10 flex-1 items-center justify-center gap-2 px-4 text-sm"
              >
                <Sparkles className="h-4 w-4" />
                Ask {DC_AI_NAME} anything
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="inline-flex h-10 items-center justify-center px-3 text-sm font-medium text-foreground/55 hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
