"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  isAppRootPath,
  navigateToPostAuthEntry,
  normalizeAppPathname,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isCapacitorNativeApp()) return;
    if (loading) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    navigateToPostAuthEntry((href) => router.replace(href));
  }, [loading, router, user?.id]);

  if (isCapacitorNativeApp()) {
    return null;
  }

  const quickDest = resolveQuickEntryDestination();
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
