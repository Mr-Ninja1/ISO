"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp, markCapacitorShell } from "@/lib/capacitor/runtime";
import { recoverCapacitorWebViewIfStrayed } from "@/lib/capacitor/openExternalUrl";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { setNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { runNativeEntryRedirectIfNeeded } from "@/lib/capacitor/nativeEntryNavigation";
import { signalLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { initReachabilityMonitor } from "@/lib/client/reachability";

function runNativeBoot() {
  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) {
    setNativeUpdateBlocked(true);
    return;
  }
  runNativeEntryRedirectIfNeeded();
}

function scheduleNativeBoot() {
  runNativeBoot();
}

if (typeof window !== "undefined" && isCapacitorNativeApp()) {
  markCapacitorShell();
  recoverCapacitorWebViewIfStrayed();
  void signalLiveUpdateReady();
  scheduleNativeBoot();
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
    scheduleNativeBoot();

    const retryDelays = [300, 900, 2000];
    const timers = retryDelays.map((delay) => window.setTimeout(scheduleNativeBoot, delay));

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      stopReachability();
    };
  }, []);

  return null;
}
