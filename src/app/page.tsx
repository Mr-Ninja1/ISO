"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  hardNavigate,
  navigateToPostAuthEntry,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";
import {
  forceNativeEntryExit,
  isNativeEntryShellPath,
  runNativeEntryRedirectIfNeeded,
} from "@/lib/capacitor/nativeEntryNavigation";

const ENTRY_FAILSAFE_MS = 4000;
const NATIVE_ROUTER_EXIT_MS = 350;
const NATIVE_HARD_EXIT_MS = 1800;

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
    if (isCapacitorNativeApp()) return;
    if (!hasPersistedAuthCredentials()) {
      redirectToEntry();
    }
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

    const tryRouterExit = () => {
      if (!isNativeEntryShellPath()) return;
      router.replace(dest);
    };

    runNativeEntryRedirectIfNeeded();
    const routerTimer = window.setTimeout(tryRouterExit, NATIVE_ROUTER_EXIT_MS);
    const hardTimer = window.setTimeout(() => {
      if (!isNativeEntryShellPath()) return;
      forceNativeEntryExit();
    }, NATIVE_HARD_EXIT_MS);
    const failsafeTimer = window.setTimeout(() => {
      if (!isNativeEntryShellPath()) return;
      hardNavigate(dest);
    }, ENTRY_FAILSAFE_MS);

    return () => {
      window.clearTimeout(routerTimer);
      window.clearTimeout(hardTimer);
      window.clearTimeout(failsafeTimer);
    };
  }, [router]);

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
