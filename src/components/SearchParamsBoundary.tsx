"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";

type Props = {
  children: ReactNode;
  /** Full-screen shell for app-level routes (workspace, bootstrap). */
  fullScreen?: boolean;
};

function resolveLoadingFallback(fullScreen: boolean, pathname: string | null) {
  const path = pathname || "";
  const isWorkspaceRoute = path === "/workspace" || path.startsWith("/workspace/");

  if (fullScreen && isWorkspaceRoute) {
    return <WorkspaceLoadingShell />;
  }

  if (fullScreen && path.startsWith("/_/")) {
    return (
      <WorkspaceLoadingShell title="Loading page" subtitle="Opening your form or brand page…" />
    );
  }

  if (fullScreen) {
    return (
      <WorkspaceLoadingShell title="Loading" subtitle="Preparing the app…" />
    );
  }

  return <RouteLoadingFallback />;
}

export function SearchParamsBoundary({ children, fullScreen = false }: Props) {
  return (
    <Suspense fallback={<SearchParamsFallback fullScreen={fullScreen} />}>{children}</Suspense>
  );
}

function SearchParamsFallback({ fullScreen }: { fullScreen: boolean }) {
  const pathname = usePathname();
  return resolveLoadingFallback(fullScreen, pathname);
}
