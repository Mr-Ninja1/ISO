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

// OTA reload: acknowledge bundle before redirects; ready() prevents rollback flicker.
if (typeof window !== "undefined" && isCapacitorNativeApp()) {
  markCapacitorShell();
  recoverCapacitorWebViewIfStrayed();
  runAfterLiveUpdateReady(runNativeBoot);
}

/** Marks embedded Capacitor sessions so auth/offline helpers use the mobile code paths. */
export function CapacitorBootstrap() {
  useEffect(() => {
    markCapacitorShell();
    recoverCapacitorWebViewIfStrayed();
    if (typeof window !== "undefined") {
      window.__ISO_IS_NATIVE__ = isCapacitorNativeApp();
    }

    void signalLiveUpdateReady().then(() => {
      clearOtaReloadMarker();
    });

    return initReachabilityMonitor();
  }, []);

  return null;
}
