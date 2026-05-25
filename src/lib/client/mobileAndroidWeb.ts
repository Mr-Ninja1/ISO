import { isInstalledNativeShell } from "@/lib/capacitor/runtime";

/** Installed Capacitor APK — never show “download the app” marketing / APK install promos. */
export function isInstalledNativeApp(): boolean {
  return isInstalledNativeShell();
}

/** Android APK download promos — any browser on the public website, never the installed shell. */
export function shouldShowApkInstallPromo(): boolean {
  if (typeof window === "undefined") return false;
  return !isInstalledNativeShell();
}

/** @deprecated Use shouldShowApkInstallPromo */
export function isMobileWebBrowser(): boolean {
  return shouldShowApkInstallPromo();
}

/** @deprecated Use shouldShowApkInstallPromo */
export const isAndroidMobileWeb = shouldShowApkInstallPromo;

/** @deprecated Use WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY */
export const MOBILE_APP_BANNER_DISMISS_KEY = "iso-mobile-app-banner-dismissed:v1";

export const WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY = "iso-workspace-android-app-card:v1";
