"use client";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
};

function readCapacitor() {
  if (typeof window === "undefined") return undefined;
  return (window as CapacitorWindow).Capacitor;
}

/** True when running inside the Capacitor APK/WebView — not a normal browser tab. */
export function isCapacitorNativeApp() {
  if (typeof window === "undefined") return false;

  const cap = readCapacitor();
  if (cap?.isNativePlatform?.()) return true;

  // NEXT_PUBLIC_CAPACITOR_APP is baked into APK/OTA builds. It may also appear in shared
  // .env.local for dev — never treat http(s) browser tabs as native from env alone.
  if (process.env.NEXT_PUBLIC_CAPACITOR_APP === "1") {
    const protocol = window.location.protocol;
    if (protocol === "capacitor:" || protocol === "file:") return true;

    try {
      const ua = navigator.userAgent || "";
      // Android System WebView (sideloaded APK)
      if (/Android/i.test(ua) && /\bwv\b/i.test(ua)) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export function markCapacitorShell() {
  if (typeof window === "undefined") return;
  if (!isCapacitorNativeApp()) return;
  try {
    localStorage.setItem("__ISO_MOBILE_SHELL__", "1");
  } catch {
    // ignore
  }
}
