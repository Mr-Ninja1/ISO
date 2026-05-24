"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { navigateToPostAuthEntry } from "@/lib/client/appEntryNavigation";

export default function Home() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (isCapacitorNativeApp()) return;
    if (authLoading) return;
    if (redirectedRef.current) return;

    redirectedRef.current = true;
    navigateToPostAuthEntry((href) => router.replace(href));
  }, [authLoading, router, user?.id]);

  if (isCapacitorNativeApp()) {
    return null;
  }

  const goingToLogin = !hasPersistedAuthCredentials() && !user?.id;

  return (
    <WorkspaceLoadingShell
      title="Starting ISO Pro"
      subtitle={goingToLogin ? "Taking you to sign in…" : "Opening your workspace…"}
    />
  );
}
