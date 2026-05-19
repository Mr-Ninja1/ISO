import { getCachedReachability } from "@/lib/client/reachability";
import { INTERNET_RESTORED_EVENT, OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/connectivityEvents";

export { INTERNET_RESTORED_EVENT, OFFLINE_MODE_CHANGED_EVENT };

/**
 * Offline detection for workspace / audits: combines browser connectivity with an optional
 * shell flag set by iso-mobile (navigator.onLine is unreliable inside some WebViews).
 */

declare global {
  interface Window {
    __ISO_FORCE_OFFLINE__?: boolean;
    __ISO_IS_NATIVE__?: boolean;
  }
}

let lastOnlineStatus = typeof navigator !== "undefined" ? navigator.onLine : true;

export function isAppOffline(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.__ISO_FORCE_OFFLINE__ === true) return true;
  } catch {
    /* ignore */
  }

  const probed = getCachedReachability();
  if (probed !== null) return !probed;

  return typeof navigator !== "undefined" ? !navigator.onLine : false;
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.__ISO_IS_NATIVE__ === true;
  } catch {
    return false;
  }
}

/** Called from embedded shell after toggling `__ISO_FORCE_OFFLINE__`. */
export function notifyOfflineModeChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_MODE_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Monitor online/offline transitions and notify when internet is restored. */
export function initInternetStatusMonitor(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    const wasOffline = lastOnlineStatus === false;
    lastOnlineStatus = true;
    if (wasOffline) {
      window.dispatchEvent(new CustomEvent(INTERNET_RESTORED_EVENT));
    }
  };

  const handleOffline = () => {
    lastOnlineStatus = false;
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
