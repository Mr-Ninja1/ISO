"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { recoverCapacitorWebViewIfStrayed } from "@/lib/capacitor/openExternalUrl";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { setNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { isNativeEntryShellPath, runNativeEntryRedirectIfNeeded } from "@/lib/capacitor/nativeEntryNavigation";
import { shouldSkipReactNativeEntryRedirect } from "@/lib/capacitor/nativeBootCoordinator";
import { signalLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { initReachabilityMonitor } from "@/lib/client/reachability";

function runNativeBoot() {
  if (shouldSkipReactNativeEntryRedirect()) return;
  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) {
    setNativeUpdateBlocked(true);
    return;
  }
  runNativeEntryRedirectIfNeeded();
}

if (typeof window !== "undefined" && isCapacitorNativeApp()) {
  markCapacitorShell();
  recoverCapacitorWebViewIfStrayed();
  void signalLiveUpdateReady();
}

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    const stopReachability = initReachabilityMonitor();

    if (!isCapacitorNativeApp()) {
      return stopReachability;
    }

    markCapacitorShell();
    recoverCapacitorWebViewIfStrayed();
    if (typeof window !== "undefined") {
      window.__ISO_IS_NATIVE__ = true;
    }

    void signalLiveUpdateReady();

    if (isNativeEntryShellPath()) {
      if (!shouldSkipReactNativeEntryRedirect()) {
        runNativeBoot();
      }
      const fallback = window.setTimeout(() => {
        if (!isNativeEntryShellPath()) return;
        if (!runNativeEntryRedirectIfNeeded()) {
          runNativeEntryRedirectIfNeeded({ force: true });
        }
      }, 1200);
      return () => {
        window.clearTimeout(fallback);
        stopReachability();
      };
    }

    return stopReachability;
  }, []);

  return null;
}
