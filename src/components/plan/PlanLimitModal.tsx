"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Mail, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  buildUpgradeMailto,
  planLimitCopy,
  type PlanLimitDetails,
  type PlanLimitKind,
} from "@/lib/planLimitMessaging";

type Props = {
  open: boolean;
  kind: PlanLimitKind;
  details?: PlanLimitDetails;
  onClose: () => void;
  settingsHref?: string;
};

export function PlanLimitModal({ open, kind, details = {}, onClose, settingsHref }: Props) {
  const copy = planLimitCopy(kind, details);
  const mailto = buildUpgradeMailto(details);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-t-2xl border border-foreground/10 bg-background p-5 shadow-2xl sm:rounded-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--hse-teal)] to-[color-mix(in_srgb,var(--hse-teal)_70%,#0f766e)] text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{copy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{copy.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-foreground/45 hover:bg-foreground/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a
            href={mailto}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--hse-teal)] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.actionLabel}</span>
          </a>
          {settingsHref ? (
            <Link
              href={settingsHref}
              onClick={onClose}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-foreground/15 px-4 text-sm font-medium text-foreground/80 hover:bg-foreground/5"
            >
              View usage
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-foreground/10 px-4 text-sm text-foreground/60 hover:bg-foreground/5 sm:flex-none sm:px-5"
          >
            Not now
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-foreground/45 sm:text-left">
          Your platform developer can adjust limits instantly from the Developer console — no payment
          setup required yet.
        </p>
      </div>
    </div>,
    document.body,
  );
}
