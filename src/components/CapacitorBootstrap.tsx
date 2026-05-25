"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { recoverCapacitorWebViewIfStrayed } from "@/lib/capacitor/openExternalUrl";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { setNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { runNativeEntryRedirectIfNeeded } from "@/lib/capacitor/nativeEntryNavigation";
import {
  clearOtaReloadMarker,
  runAfterLiveUpdateReady,
  signalLiveUpdateReady,
} from "@/lib/capacitor/liveUpdateReady";
import { initReachabilityMonitor } from "@/lib/client/reachability";

function runNativeBoot() {
  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) {
    setNativeUpdateBlocked(true);
    return;
  }
  runNativeEntryRedirectIfNeeded();
}

// Mark shell early (localhost WebView) so promos like “Download APK” hide before Capacitor bridge loads.
if (typeof window !== "undefined") {
  if (isCapacitorNativeApp()) {
    markCapacitorShell();
  }
  if (isCapacitorNativeApp()) {
    recoverCapacitorWebViewIfStrayed();
    runAfterLiveUpdateReady(runNativeBoot);
  }
}

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    if (isCapacitorNativeApp()) {
      markCapacitorShell();
      recoverCapacitorWebViewIfStrayed();
      if (typeof window !== "undefined") {
        window.__ISO_IS_NATIVE__ = true;
      }

      void signalLiveUpdateReady().then(() => {
        clearOtaReloadMarker();
      });
    }

    return initReachabilityMonitor();
  }, []);

  return null;
}
