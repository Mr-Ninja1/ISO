"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { isNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import {
  clearOtaEntryNavigationAttempted,
  shouldSkipReactNativeEntryRedirect,
} from "@/lib/capacitor/nativeBootCoordinator";
import { clearOtaReloadMarker } from "@/lib/capacitor/liveUpdateReady";
import {
  hardNavigate,
  navigateToPostAuthEntry,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";
import {
  clearNativeRedirectThrottle,
  isNativeEntryShellPath,
  runNativeEntryRedirectIfNeeded,
} from "@/lib/capacitor/nativeEntryNavigation";
import { startingAppTitle } from "@/lib/branding";

const ENTRY_FAILSAFE_MS = 4000;

export default function Home() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const redirectedRef = useRef(false);

  const redirectToEntry = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    navigateToPostAuthEntry((href) => router.replace(href));
  };

  useLayoutEffect(() => {
    if (!isCapacitorNativeApp()) {
      if (!hasPersistedAuthCredentials()) {
        redirectToEntry();
      }
      return;
    }

    if (shouldSkipReactNativeEntryRedirect()) return;
    runNativeEntryRedirectIfNeeded();
  }, []);

  useEffect(() => {
    if (isCapacitorNativeApp()) return;
    if (!authLoading) {
      redirectToEntry();
    }
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const timer = window.setTimeout(() => {
      if (!isNativeEntryShellPath()) return;
      if (!runNativeEntryRedirectIfNeeded()) {
        clearOtaReloadMarker();
        clearOtaEntryNavigationAttempted();
        clearNativeRedirectThrottle();
        runNativeEntryRedirectIfNeeded({ force: true });
      }
    }, ENTRY_FAILSAFE_MS);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isCapacitorNativeApp()) return;

    const timer = window.setTimeout(() => {
      if (redirectedRef.current) return;
      const dest = resolveQuickEntryDestination() || "/login";
      redirectedRef.current = true;
      hardNavigate(dest);
    }, ENTRY_FAILSAFE_MS);

    return () => window.clearTimeout(timer);
  }, []);

  if (isCapacitorNativeApp()) {
    const dest = resolveQuickEntryDestination();
    const updateRequired =
      isNativeUpdateBlocked() || isNativeUpdateRequiredFromCache(parseNativeBuild());

    if (updateRequired) {
      return (
        <WorkspaceLoadingShell
          title="Update required"
          subtitle="Install the latest APK from the prompt above to continue."
        />
      );
    }

    return (
      <WorkspaceLoadingShell
        title={startingAppTitle()}
        subtitle={dest === "/login" ? "Taking you to sign in…" : "Opening your workspace…"}
      />
    );
  }

  const goingToLogin = !hasPersistedAuthCredentials() && !user?.id;

  return (
    <WorkspaceLoadingShell
      title={startingAppTitle()}
      subtitle={goingToLogin ? "Taking you to sign in…" : "Opening your workspace…"}
    />
  );
}
