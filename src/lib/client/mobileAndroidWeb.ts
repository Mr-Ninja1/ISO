import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** Installed Capacitor APK — never show “download the app” marketing / APK install promos. */
export function isInstalledNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return isCapacitorNativeApp();
}

/** “Get the app” / APK download promos — mobile browser only, never the installed shell. */
export function shouldShowApkInstallPromo(): boolean {
  if (typeof window === "undefined") return false;
  if (isInstalledNativeApp()) return false;
  return isMobileWebBrowser();
}

/** True when the user is on a mobile browser — not the installed Capacitor app. */
export function isMobileWebBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (isInstalledNativeApp()) return false;

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

/** @deprecated Use isMobileWebBrowser */
export const isAndroidMobileWeb = isMobileWebBrowser;

/** @deprecated Use WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY */
export const MOBILE_APP_BANNER_DISMISS_KEY = "iso-mobile-app-banner-dismissed:v1";

export const WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY = "iso-workspace-android-app-card:v1";
