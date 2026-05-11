"use client";

import { useEffect } from "react";
import { ArrowRight, CheckCircle2, X } from "lucide-react";

export function WorkspaceTourModal({
  open,
  onClose,
  onStartSetup,
}: {
  open: boolean;
  onClose: () => void;
  onStartSetup: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close workspace tour"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-foreground/20 bg-background p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Start here
            </div>
            <h2 className="mt-3 text-lg font-semibold">Create categories first</h2>
            <p className="mt-2 text-sm leading-6 text-foreground/70">
              Categories keep forms organised and easy to manage. Once categories exist, you can start building forms under each one.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-foreground/20 p-2"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-foreground/15 bg-foreground/[0.02] p-3 text-sm text-foreground/70">
          Tip: categories like <span className="font-medium text-foreground">Front of House</span>,{" "}
          <span className="font-medium text-foreground">Kitchen</span>, or{" "}
          <span className="font-medium text-foreground">Storage</span> help teams find forms faster.
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-foreground/20 px-4 text-sm font-medium hover:bg-foreground/5"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onStartSetup}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background"
          >
            Create categories
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}