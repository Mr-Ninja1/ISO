"use client";

import { Suspense, type ReactNode } from "react";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";

type Props = {
  children: ReactNode;
  /** App shell routes use a light overlay; OfflineBootstrapGate owns full-screen loading. */
  fullScreen?: boolean;
};

/** Lightweight overlay — avoids stacking two WorkspaceLoadingShell instances (split screen). */
function AppSuspenseFallback() {
  return (
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-foreground/70">
        <div className="iso-loading-spinner h-5 w-5" aria-hidden />
        Loading…
      </div>
    </div>
  );
}

export function SearchParamsBoundary({ children, fullScreen = false }: Props) {
  const fallback = fullScreen ? <AppSuspenseFallback /> : <RouteLoadingFallback />;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
