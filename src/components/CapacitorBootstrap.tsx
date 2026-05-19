"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { initReachabilityMonitor } from "@/lib/client/reachability";

// Run before first paint so AuthProvider's createClient() reads sb-*-auth-token from localStorage.
if (typeof window !== "undefined" && isCapacitorNativeApp()) {
  markCapacitorShell();
}

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    markCapacitorShell();
    if (typeof window !== "undefined") {
      window.__ISO_IS_NATIVE__ = isCapacitorNativeApp();
    }
    return initReachabilityMonitor();
  }, []);

  return null;
}
