"use client";

import { Suspense, type ReactNode } from "react";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";

type Props = {
  children: ReactNode;
  /** Full-screen shell for app-level routes (workspace, bootstrap). */
  fullScreen?: boolean;
};

export function SearchParamsBoundary({ children, fullScreen = false }: Props) {
  const fallback = fullScreen ? <WorkspaceLoadingShell /> : <RouteLoadingFallback />;
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
