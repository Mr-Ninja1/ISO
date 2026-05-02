/**
 * Offline detection for workspace / audits: combines browser connectivity with an optional
 * shell flag set by iso-mobile (navigator.onLine is unreliable inside some WebViews).
 */

export const OFFLINE_MODE_CHANGED_EVENT = "iso-offline-mode-changed";

declare global {
  interface Window {
    __ISO_FORCE_OFFLINE__?: boolean;
  }
}

export function isAppOffline(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.__ISO_FORCE_OFFLINE__ === true) return true;
  } catch {
    /* ignore */
  }
  return typeof navigator !== "undefined" ? !navigator.onLine : false;
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
