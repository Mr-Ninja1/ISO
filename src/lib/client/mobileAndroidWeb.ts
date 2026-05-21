import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** True when the user is on Android mobile browser — not the installed Capacitor app. */
export function isAndroidMobileWeb(): boolean {
  if (typeof window === "undefined") return false;
  if (isCapacitorNativeApp()) return false;

  const ua = navigator.userAgent || "";
  if (!/Android/i.test(ua)) return false;

  // Phones typically include "Mobile" in the UA; many tablets do not but are still touch devices.
  if (/Mobile/i.test(ua)) return true;

  const touch = navigator.maxTouchPoints > 0;
  const tabletOrPhoneViewport =
    window.matchMedia?.("(max-width: 1024px)")?.matches ?? window.innerWidth <= 1024;

  return touch && tabletOrPhoneViewport;
}

export const MOBILE_APP_BANNER_DISMISS_KEY = "iso-mobile-app-banner-dismissed:v1";
