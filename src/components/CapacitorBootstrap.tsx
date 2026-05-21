"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { recoverCapacitorWebViewIfStrayed } from "@/lib/capacitor/openExternalUrl";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { setNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";
import { initReachabilityMonitor } from "@/lib/client/reachability";

// Run before first paint so AuthProvider's createClient() reads sb-*-auth-token from localStorage.
if (typeof window !== "undefined" && isCapacitorNativeApp()) {
  markCapacitorShell();
  recoverCapacitorWebViewIfStrayed();

  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) {
    setNativeUpdateBlocked(true);
  } else {
    const path = normalizeAppPathname(window.location.pathname);
    const search = window.location.search;
    if (isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search)) {
      const dest = resolveQuickEntryDestination();
      if (dest) hardNavigate(dest);
    }
  }
}

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    markCapacitorShell();
    recoverCapacitorWebViewIfStrayed();
    if (typeof window !== "undefined") {
      window.__ISO_IS_NATIVE__ = isCapacitorNativeApp();
    }
    return initReachabilityMonitor();
  }, []);

  return null;
}
