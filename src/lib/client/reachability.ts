"use client";

import { getApiBaseUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { INTERNET_RESTORED_EVENT, OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/connectivityEvents";

let cachedReachable: boolean | null = null;
let lastProbeAt = 0;
let probeInFlight: Promise<boolean> | null = null;

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
      cachedReachable = false;
      lastProbeAt = Date.now();
      return false;
    }
  } catch {
    // ignore
  }

  const now = Date.now();
  if (!force && cachedReachable !== null && now - lastProbeAt < 8000) {
    return cachedReachable;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const wasOnline = cachedReachable === true;
    cachedReachable = false;
    lastProbeAt = now;
    if (wasOnline) dispatchOfflineChanged();
    return false;
  }

  if (probeInFlight) return probeInFlight;

  probeInFlight = (async () => {
    const wasOffline = cachedReachable === false;
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

    if (cachedReachable && wasOffline) {
      window.dispatchEvent(new CustomEvent(INTERNET_RESTORED_EVENT));
    }
    dispatchOfflineChanged();
    return cachedReachable;
  })();

  return probeInFlight;
}

export function getCachedReachability(): boolean | null {
  return cachedReachable;
}

export function initReachabilityMonitor(): () => void {
  if (typeof window === "undefined") return () => {};

  const runProbe = () => {
    void probeInternetReachability(true);
  };

  const handleBrowserOffline = () => {
    cachedReachable = false;
    lastProbeAt = Date.now();
    dispatchOfflineChanged();
  };

  runProbe();
  window.addEventListener("online", runProbe);
  window.addEventListener("offline", handleBrowserOffline);

  const intervalMs = isCapacitorNativeApp() ? 12_000 : 30_000;
  const intervalId = window.setInterval(runProbe, intervalMs);

  return () => {
    window.removeEventListener("online", runProbe);
    window.removeEventListener("offline", handleBrowserOffline);
    window.clearInterval(intervalId);
  };
}
