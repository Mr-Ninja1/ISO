"use client";

import { Suspense, type ReactNode } from "react";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";

type Props = {
  children: ReactNode;
  /** App shell routes use a light overlay; OfflineBootstrapGate owns full-screen loading. */
  fullScreen?: boolean;
  /**
   * No Suspense fallback UI — for cache-backed form/report opens where a "Loading…"
   * flash is worse than a brief blank while searchParams resolve.
   */
  quiet?: boolean;
};

export function SearchParamsBoundary({ children, fullScreen = false, quiet = false }: Props) {
  // Prefer a non-blocking fallback so soft navigations don't flash a full-screen
  // overlay over the whole app while useSearchParams resolves.
  const fallback = fullScreen || quiet ? null : <RouteLoadingFallback />;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
