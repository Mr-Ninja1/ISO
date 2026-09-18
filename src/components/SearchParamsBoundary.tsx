"use client";

import { Suspense, type ReactNode } from "react";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";

type Props = {
  children: ReactNode;
  /** App shell routes use a light overlay; OfflineBootstrapGate owns full-screen loading. */
  fullScreen?: boolean;
};

export function SearchParamsBoundary({ children, fullScreen = false }: Props) {
  // Prefer a non-blocking fallback so soft navigations don't flash a full-screen
  // overlay over the whole app while useSearchParams resolves.
  const fallback = fullScreen ? null : <RouteLoadingFallback />;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
