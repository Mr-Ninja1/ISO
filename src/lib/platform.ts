/**
 * Stable platform defaults — use Azure host instead of custom domains
 * (custom domains) so APK + OTA + email redirects keep working
 * even if DNS changes.
 */
export const PLATFORM_APP_NAME = "ISO Grid";

export const PLATFORM_API_HOST =
  "iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net";

export const PLATFORM_API_BASE_URL = `https://${PLATFORM_API_HOST}`;

export const PLATFORM_SITE_ORIGIN = `https://${PLATFORM_API_HOST}`;

