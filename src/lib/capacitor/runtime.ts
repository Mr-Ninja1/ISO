"use client";

export function isCapacitorNativeApp() {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CAPACITOR_APP === "1") return true;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function markCapacitorShell() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("__ISO_MOBILE_SHELL__", "1");
  } catch {
    // ignore
  }
}
