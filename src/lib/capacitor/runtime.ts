"use client";

const SHELL_MARKER_KEY = "__ISO_MOBILE_SHELL__";

function readShellMarker(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SHELL_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

function isCapacitorWebViewOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

function readCapacitorBridge(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } })
    .Capacitor;
  if (!cap) return false;
  if (cap.isNativePlatform?.()) return true;
  const platform = cap.getPlatform?.();
  return platform === "android" || platform === "ios";
}

/**
 * Runtime-only: Capacitor bridge or emulator WebView (never a normal mobile browser tab).
 * Use this for “hide download APK” promos so a mistaken build flag on the website cannot suppress them.
 */
export function isInstalledNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  if (readCapacitorBridge()) return true;
  if (isCapacitorWebViewOrigin()) return true;
  return false;
}

/**
 * True when running inside the installed Capacitor shell (APK), not the public website.
 */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CAPACITOR_APP === "1") return true;
  return isInstalledNativeShell();
}

/** Clears a mistaken shell flag left by older web sign-in code (caused redirect flicker on the hosted site). */
export function clearStaleCapacitorShellMarkerIfWeb() {
  if (typeof window === "undefined") return;
  if (isCapacitorNativeApp()) return;
  try {
    localStorage.removeItem(SHELL_MARKER_KEY);
  } catch {
    // ignore
  }
}

export function markCapacitorShell() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHELL_MARKER_KEY, "1");
  } catch {
    // ignore
  }
}
