"use client";

import { OTA_BUNDLE_STORAGE_KEY } from "@/lib/capacitor/liveUpdateClient";
import { clearOtaEntryNavigationAttempted } from "@/lib/capacitor/nativeBootCoordinator";
import { clearNativeRedirectThrottle } from "@/lib/capacitor/nativeEntryNavigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

const OTA_RELOAD_MARKER = "iso-ota-reload-at:v1";

let readyPromise: Promise<boolean> | null = null;

/** Tell Capawesome the current web bundle loaded successfully (prevents rollback to APK default). */
export async function signalLiveUpdateReady(): Promise<boolean> {
  if (!isCapacitorNativeApp()) return true;

  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
        const result = await LiveUpdate.ready();
        if (result.rollback) {
          try {
            localStorage.removeItem(OTA_BUNDLE_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
        return !result.rollback;
      } catch {
        return true;
      }
    })();
  }

  return readyPromise;
}

export function markOtaReloadPending() {
  if (typeof window === "undefined") return;
  clearOtaEntryNavigationAttempted();
  clearNativeRedirectThrottle();
  try {
    sessionStorage.setItem(OTA_RELOAD_MARKER, String(Date.now()));
  } catch {
    // ignore
  }
}

export function wasOtaReloadRecent(maxAgeMs = 120_000): boolean {
  if (typeof window === "undefined") return false;
  try {
    const at = Number(sessionStorage.getItem(OTA_RELOAD_MARKER) || "0");
    if (!at) return false;
    return Date.now() - at < maxAgeMs;
  } catch {
    return false;
  }
}

/** Clears the post-OTA reload flag only (keeps redirect throttle until entry navigation succeeds). */
export function clearOtaReloadMarker() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(OTA_RELOAD_MARKER);
  } catch {
    // ignore
  }
}

/** Run native boot logic only after the live-update plugin acknowledges the active bundle. */
export function runAfterLiveUpdateReady(fn: () => void) {
  void signalLiveUpdateReady().finally(fn);
}
