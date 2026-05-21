import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** True when the user is on Android mobile browser — not the installed Capacitor app. */
export function isAndroidMobileWeb(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;

  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;

  // Most phones include "Mobile" in the UA.
  if (/Mobile/i.test(ua)) return true;

  // Tablets / responsive mode: touch + typical phone/tablet width.
  const touch = navigator.maxTouchPoints > 0;
  const narrowViewport =
    window.matchMedia?.("(max-width: 1280px)")?.matches ?? window.innerWidth <= 1280;

  return touch && narrowViewport;
}

/** @deprecated Use WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY */
export const MOBILE_APP_BANNER_DISMISS_KEY = "iso-mobile-app-banner-dismissed:v1";

export const WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY = "iso-workspace-android-app-card:v1";
