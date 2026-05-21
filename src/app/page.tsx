"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  hardNavigate,
  isAppRootPath,
  navigateToPostAuthEntry,
  normalizeAppPathname,
  resolvePostAuthDestinationAsync,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();
  const redirectedRef = useRef(false);
  const quickDest = resolveQuickEntryDestination();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeUpdateBlocked()) return;
    if (isCapacitorNativeApp() && isNativeUpdateRequiredFromCache(parseNativeBuild())) return;

    const dest = resolveQuickEntryDestination();
    if (!dest) return;

    redirectedRef.current = true;
    if (isCapacitorNativeApp()) {
      hardNavigate(dest);
    } else {
      router.replace(dest);
    }
  }, [router]);

  useEffect(() => {
    if (isNativeUpdateBlocked()) return;
    if (isCapacitorNativeApp() && isNativeUpdateRequiredFromCache(parseNativeBuild())) return;
    if (loading) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    navigateToPostAuthEntry((href) => router.replace(href));

    const fallbackMs = user?.id || hasPersistedAuthCredentials() ? 2000 : 1200;
    const timeoutId = window.setTimeout(() => {
      const path = normalizeAppPathname(window.location.pathname);
      if (!isAppRootPath(path)) return;
      void resolvePostAuthDestinationAsync().then((dest) => hardNavigate(dest));
    }, fallbackMs);

    return () => window.clearTimeout(timeoutId);
  }, [loading, router, user?.id]);

  if (isNativeUpdateBlocked() || isNativeUpdateRequiredFromCache(parseNativeBuild())) {
    return null;
  }

  if (quickDest) {
    return null;
  }

  if (!loading) {
    return null;
  }

  return (
    <WorkspaceLoadingShell
      title="Starting ISO Pro"
      subtitle={hasPersistedAuthCredentials() ? "Opening your workspace…" : "Taking you to sign in…"}
    />
  );
}
