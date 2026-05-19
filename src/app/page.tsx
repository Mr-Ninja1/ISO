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

export default function Home() {
  const router = useRouter();
  const { loading, user } = useAuth();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    navigateToPostAuthEntry((href) => router.replace(href));

    const fallbackMs = user?.id ? 2500 : 1500;
    const timeoutId = window.setTimeout(() => {
      const path = normalizeAppPathname(window.location.pathname);
      if (!isAppRootPath(path)) return;
      hardNavigate(user?.id ? "/workspace" : "/login");
    }, fallbackMs);

    return () => window.clearTimeout(timeoutId);
  }, [loading, router, user?.id]);

  return (
    <WorkspaceLoadingShell
      title="Starting ISO Pro"
      subtitle="Taking you to your workspace…"
    />
  );
}
