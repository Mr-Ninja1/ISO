"use client";

import { getApiBaseUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { INTERNET_RESTORED_EVENT, OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/connectivityEvents";
import { shouldPauseBackgroundWork } from "@/lib/client/interactionGate";

let cachedReachable: boolean | null = null;
let lastProbeAt = 0;
let probeInFlight: Promise<boolean> | null = null;

/** Singleton — many hooks used to start duplicate 12s /login storms on native. */
let monitorStarted = false;
let monitorCleanups: Array<() => void> = [];
let monitorRefCount = 0;

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function dispatchOfflineChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_MODE_CHANGED_EVENT));
}

/**
 * Probes the hosted API origin. navigator.onLine is unreliable in Android WebViews.
 * On localhost dev, slow cold starts should not mark the app offline when the browser says online.
 */
export async function probeInternetReachability(force = false): Promise<boolean> {
  if (typeof window === "undefined") return true;

  try {
    if (window.__ISO_FORCE_OFFLINE__ === true) {
      const wasReachable = cachedReachable;
      cachedReachable = false;
      lastProbeAt = Date.now();
      if (wasReachable !== false) dispatchOfflineChanged();
      return false;
    }
  } catch {
    // ignore
  }

  const now = Date.now();
  if (!force && cachedReachable !== null && now - lastProbeAt < 8000) {
    return cachedReachable;
  }

  // Never contend with form/category opens — trust the last probe (or browser) until idle.
  if (!force && shouldPauseBackgroundWork()) {
    if (cachedReachable !== null) return cachedReachable;
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const previous = cachedReachable;
    cachedReachable = false;
    lastProbeAt = now;
    if (previous !== false) dispatchOfflineChanged();
    return false;
  }

  if (probeInFlight) return probeInFlight;

  probeInFlight = (async () => {
    const previous = cachedReachable;
    const localDev = isLocalDevHost();
    try {
      const base = getApiBaseUrl();
      const target = base ? `${base}/login` : "/login";
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), localDev ? 12000 : 5000);
      const res = await fetch(target, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      cachedReachable = res.status < 500;
    } catch {
      // Slow localhost dev servers often fail a 5s probe even when online.
      cachedReachable = localDev && typeof navigator !== "undefined" && navigator.onLine;
    }

    lastProbeAt = Date.now();
    probeInFlight = null;

    if (cachedReachable && previous === false) {
      window.dispatchEvent(new CustomEvent(INTERNET_RESTORED_EVENT));
    }
    // Only notify when the answer actually changed — every-probe broadcasts
    // re-rendered the whole workspace tree every 12s on native.
    if (previous !== cachedReachable) {
      dispatchOfflineChanged();
    }
    return cachedReachable;
  })();

  return probeInFlight;
}

export function getCachedReachability(): boolean | null {
  return cachedReachable;
}

export function initReachabilityMonitor(): () => void {
  if (typeof window === "undefined") return () => {};

  monitorRefCount += 1;

  if (!monitorStarted) {
    monitorStarted = true;

    const runProbe = () => {
      if (shouldPauseBackgroundWork()) return;
      void probeInternetReachability(true);
    };

    const handleBrowserOffline = () => {
      const wasReachable = cachedReachable;
      cachedReachable = false;
      lastProbeAt = Date.now();
      if (wasReachable !== false) dispatchOfflineChanged();
    };

    const handleBrowserOnline = () => {
      // Soft probe — do not force-fight an in-flight navigation.
      void probeInternetReachability(false);
    };

    runProbe();
    window.addEventListener("online", handleBrowserOnline);
    window.addEventListener("offline", handleBrowserOffline);

    // Native: infrequent heartbeat. Cached workspace/forms do not need a live API pulse.
    const intervalMs = isCapacitorNativeApp() ? 60_000 : 45_000;
    const intervalId = window.setInterval(runProbe, intervalMs);

    monitorCleanups = [
      () => {
        window.removeEventListener("online", handleBrowserOnline);
        window.removeEventListener("offline", handleBrowserOffline);
        window.clearInterval(intervalId);
      },
    ];
  }

  return () => {
    monitorRefCount = Math.max(0, monitorRefCount - 1);
    if (monitorRefCount > 0) return;
    for (const cleanup of monitorCleanups) cleanup();
    monitorCleanups = [];
    monitorStarted = false;
  };
}
