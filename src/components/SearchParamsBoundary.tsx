"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RouteLoadingFallback } from "@/components/SuspenseFallback";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { normalizeAppPathname } from "@/lib/client/appEntryNavigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { startingAppTitle } from "@/lib/branding";

type Props = {
  children: ReactNode;
  /** Full-screen shell for app-level routes (workspace, bootstrap). */
  fullScreen?: boolean;
};

function resolveLoadingFallback(fullScreen: boolean, pathname: string | null) {
  const path = pathname || "";
  const normalized = normalizeAppPathname(path);
  const isWorkspaceRoute =
    normalized === "/workspace" || path === "/workspace" || path.startsWith("/workspace/");
  const isLoginRoute = normalized === "/login" || path.startsWith("/login/");

  if (fullScreen && isWorkspaceRoute) {
    return (
      <WorkspaceLoadingShell
        title="Loading workspace"
        subtitle="Opening your brand…"
      />
    );
  }

  if (fullScreen && isLoginRoute) {
    return (
      <WorkspaceLoadingShell
        title="Loading"
        subtitle="Opening sign in…"
      />
    );
  }

  if (fullScreen && path.startsWith("/_/")) {
    return (
      <WorkspaceLoadingShell title="Loading page" subtitle="Opening your form or brand page…" />
    );
  }

  if (fullScreen && (normalized === "/" || path === "")) {
    return (
      <WorkspaceLoadingShell
        title={startingAppTitle()}
        subtitle="Opening your workspace…"
      />
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
  const effectivePath =
    typeof window !== "undefined" && isCapacitorNativeApp()
      ? `${window.location.pathname}${window.location.search}`
      : pathname;
  return resolveLoadingFallback(fullScreen, effectivePath);
}
