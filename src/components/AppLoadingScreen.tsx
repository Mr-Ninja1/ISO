"use client";

import { Loader2 } from "lucide-react";

export function AppLoadingScreen({
  title = "Loading",
  subtitle = "Preparing your workspace...",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-foreground/15 bg-background/90 p-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.04]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <h2 className="mt-3 text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-foreground/70">{subtitle}</p>
        <div className="mt-4 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-2 w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-foreground" />
        </div>
      </div>
    </div>
  );
}
