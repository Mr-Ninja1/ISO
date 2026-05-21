"use client";

declare global {
  interface Window {
    __ISO_NATIVE_UPDATE_BLOCKED__?: boolean;
  }
}

/** App-wide flag: entry redirects and recovery must not run while the native APK gate is active. */
export function setNativeUpdateBlocked(blocked: boolean) {
  if (typeof window === "undefined") return;
  window.__ISO_NATIVE_UPDATE_BLOCKED__ = blocked;
  try {
    window.dispatchEvent(
      new CustomEvent("iso-native-update-blocked", { detail: { blocked } })
    );
  } catch {
    // ignore
  }
}

export function isNativeUpdateBlocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.__ISO_NATIVE_UPDATE_BLOCKED__ === true;
}
