"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { initReachabilityMonitor } from "@/lib/client/reachability";
import { ensureLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    markCapacitorShell();
    if (typeof window !== "undefined") {
      window.__ISO_IS_NATIVE__ = isCapacitorNativeApp();
    }
    if (isCapacitorNativeApp()) {
      void ensureLiveUpdateReady();
    }
    return initReachabilityMonitor();
  }, []);

  return null;
}
