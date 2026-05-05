"use client";

import { useEffect } from "react";
import { ArrowRight, CheckCircle2, Layers3, Users2, X } from "lucide-react";

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

  const steps = [
    {
      title: "Create categories first",
      copy: "Start with spaces like Back of House, Front of House, Kitchen, PPE, or Storage so everything stays organised.",
    },
    {
      title: "Add forms to each category",
      copy: "Use the form library or create custom forms once the workspace has a place for them.",
    },
    {
      title: "Invite staff and keep moving",
      copy: "Add team members to your brand so they can complete forms, review work, and keep records up to date.",
    },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close workspace tour"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl rounded-xl border border-foreground/20 bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Start here
            </div>
            <h2 className="mt-3 text-xl font-semibold">Your workspace is empty</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-foreground/70">
              We’ll show you the quickest path: create categories, add forms, then bring in staff. You can add as many categories as you need.
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-lg border border-foreground/15 bg-foreground/[0.02] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
                {index === 0 ? <Layers3 className="h-3.5 w-3.5" /> : index === 1 ? <ArrowRight className="h-3.5 w-3.5" /> : <Users2 className="h-3.5 w-3.5" />}
                Step {index + 1}
              </div>
              <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-foreground/70">{step.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-foreground/20 bg-foreground/[0.02] p-4">
          <p className="text-sm font-medium">Example categories people usually start with</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-foreground/70">
            {[
              "Back of House",
              "Front of House",
              "Kitchen",
              "PPE",
              "Storage",
              "Dispatch",
            ].map((item) => (
              <span key={item} className="rounded-full border border-foreground/15 px-3 py-1">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
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