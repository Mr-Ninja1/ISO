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
  hardNavigate,
  hardNavigateAbsolute,
  navigateToPostAuthEntry,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";
import {
  forceNativeEntryExit,
  isNativeEntryShellPath,
  runNativeEntryRedirectIfNeeded,
} from "@/lib/capacitor/nativeEntryNavigation";

const ENTRY_FAILSAFE_MS = 2500;

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

    const dest = resolveQuickEntryDestination() || "/login";
    runNativeEntryRedirectIfNeeded();
    hardNavigateAbsolute(dest);
  }, []);

  useEffect(() => {
    if (isCapacitorNativeApp()) return;
    if (!authLoading) {
      redirectToEntry();
    }
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const dest = resolveQuickEntryDestination() || "/login";

    runNativeEntryRedirectIfNeeded();
    const timers = [600, 1500, ENTRY_FAILSAFE_MS].map((delay) =>
      window.setTimeout(() => {
        if (!isNativeEntryShellPath()) return;
        hardNavigateAbsolute(dest);
        forceNativeEntryExit();
      }, delay)
    );

    return () => timers.forEach((id) => window.clearTimeout(id));
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
        title="Starting ISO Pro"
        subtitle={dest === "/login" ? "Taking you to sign in…" : "Opening your workspace…"}
      />
    );
  }

  const goingToLogin = !hasPersistedAuthCredentials() && !user?.id;

  return (
    <WorkspaceLoadingShell
      title="Starting ISO Pro"
      subtitle={goingToLogin ? "Taking you to sign in…" : "Opening your workspace…"}
    />
  );
}
