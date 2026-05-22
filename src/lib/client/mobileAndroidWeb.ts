import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** True when the user is on any mobile browser (phones, tablets, all platforms) — not the installed Capacitor app. */
export function isAndroidMobileWeb(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;

  // Detect iOS (iPhone, iPad, iPod)
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return true;
  
  // Detect Android
  if (/Android/i.test(ua)) return true;

  // Detect other mobile platforms
  if (/Mobile|Tablet|Opera Mini|IEMobile|Windows Phone|webOS|BlackBerry|Kindle/i.test(ua)) return true;

  // Fallback: detect mobile via touch + typical phone/tablet viewport width
  const touch = navigator.maxTouchPoints > 0;
  const narrowViewport =
    window.matchMedia?.("(max-width: 1280px)")?.matches ?? window.innerWidth <= 1280;

  return touch && narrowViewport;
}

/** @deprecated Use WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY */
export const MOBILE_APP_BANNER_DISMISS_KEY = "iso-mobile-app-banner-dismissed:v1";

export const WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY = "iso-workspace-android-app-card:v1";
