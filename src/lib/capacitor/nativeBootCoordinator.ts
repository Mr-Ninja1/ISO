"use client";

import { wasOtaReloadRecent } from "@/lib/capacitor/liveUpdateReady";
import { isNativeEntryShellPath } from "@/lib/capacitor/nativeEntryNavigation";

const OTA_NAV_ATTEMPTED_KEY = "iso-native-ota-nav-attempted:v1";
const BOOT_EXIT_KEY = "iso-native-boot-exit:v1";

export function markOtaEntryNavigationAttempted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(OTA_NAV_ATTEMPTED_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearOtaEntryNavigationAttempted() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(OTA_NAV_ATTEMPTED_KEY);
    sessionStorage.removeItem(BOOT_EXIT_KEY);
  } catch {
    // ignore
  }
}

export function wasOtaEntryNavigationAttempted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(OTA_NAV_ATTEMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function wasNativeBootExitComplete(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(BOOT_EXIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNativeBootExitComplete() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BOOT_EXIT_KEY, "1");
  } catch {
    // ignore
  }
}

/** True during post-OTA settle — suppress duplicate redirects/recovery. */
export function isNativePostOtaSettlePhase(): boolean {
  return wasOtaReloadRecent(180_000);
}

/**
 * React must not double-redirect after OTA only when we already left `/`.
 * Pre-React may set "nav attempted" even when redirect failed — do not skip then.
 */
export function shouldSkipReactNativeEntryRedirect(): boolean {
  if (!isNativePostOtaSettlePhase()) return false;
  if (!isNativeEntryShellPath()) return true;
  return wasOtaEntryNavigationAttempted() && wasNativeBootExitComplete();
}
