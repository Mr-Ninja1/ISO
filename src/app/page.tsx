"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { WorkspaceLoadingShell } from "@/components/WorkspaceLoadingShell";
import {
  hardNavigate,
  isAppRootPath,
  navigateToPostAuthEntry,
  normalizeAppPathname,
} from "@/lib/client/appEntryNavigation";
import { isWithinOtaBootGracePeriod } from "@/lib/capacitor/otaBoot";

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    navigateToPostAuthEntry((href) => router.replace(href));

    const fallbackMs = isWithinOtaBootGracePeriod() ? 12_000 : user?.id ? 2500 : 1500;
    const timeoutId = window.setTimeout(() => {
      if (isWithinOtaBootGracePeriod()) return;
      const path = normalizeAppPathname(window.location.pathname);
      if (!isAppRootPath(path)) return;
      hardNavigate(user?.id ? "/workspace" : "/login");
    }, fallbackMs);

    return () => window.clearTimeout(timeoutId);
  }, [loading, router, user?.id]);

  return (
    <WorkspaceLoadingShell
      title="Starting ISO Grid"
      subtitle="Taking you to your workspace… • deployment test"
    />
  );
}
