"use client";

import { Loader2 } from "lucide-react";

type Props = {
  title?: string;
  subtitle?: string;
};

/** Visible loading state for workspace and bootstrap gates (avoids blank WebView flashes). */
export function WorkspaceLoadingShell({
  title = "Loading workspace",
  subtitle = "Restoring your brand and cached forms…",
}: Props) {
  return (
    <div className="workspace-shell flex min-h-dvh flex-col">
      <div className="ws-header-accent" />
      <div className="ws-header border-b px-4 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--hse-sky)]" />
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded-md bg-[var(--hse-cream-deep)]" />
            <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--hse-sky)]" />
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--hse-teal)] to-[var(--hse-teal-mid)] text-white shadow-lg">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-[var(--hse-charcoal)]">{title}</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--hse-teal-mid)]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
