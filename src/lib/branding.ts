/** Product display name — rebrand-safe single source. */
export const PRODUCT_NAME = "ISO Grid";

export const PRODUCT_NAME_ANDROID = `${PRODUCT_NAME} for Android`;

export function startingAppTitle() {
  return `Starting ${PRODUCT_NAME}`;
}

export function installLatestAppTitle() {
  return `Install the latest ${PRODUCT_NAME} app`;
}

export function downloadAndroidLabel() {
  return `Download ${PRODUCT_NAME_ANDROID}`;
}

export function newToProductLabel() {
  return `New to ${PRODUCT_NAME}?`;
}

/** Android applicationId / Capacitor appId (must match build.gradle). */
export const ANDROID_APP_ID = "com.isogrid.app";

/** Default GitHub Releases APK asset filename. */
export const ANDROID_APK_FILENAME = "iso-grid.apk";
