/**
 * Canonical hosted origin — always from env in production.
 * Default: Azure app URL. Custom domains are DNS-only (set NEXT_PUBLIC_SITE_URL).
 */
export const DEFAULT_SITE_ORIGIN =
  "https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net";

export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/** Primary site URL (emails, OTA defaults, native API base when not overridden). */
export function getConfiguredSiteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    DEFAULT_SITE_ORIGIN;
  return trimTrailingSlash(raw);
}

/** Folder on the host that serves manifest.json + bundle zip (no trailing slash). */
export function getOtaPublicBaseUrl(): string {
  const explicit = process.env.OTA_PUBLIC_BASE_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);
  return `${getConfiguredSiteOrigin()}/ota/production`;
}

export function getDefaultOtaManifestUrl(): string {
  return `${getOtaPublicBaseUrl()}/manifest.json`;
}

export function hostnameFromSiteOrigin(origin = getConfiguredSiteOrigin()): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

/** Extra WebView navigation hosts (comma-separated), e.g. legacy domain during migration. */
export function extraAllowedNavigationHosts(): string[] {
  const raw = process.env.NEXT_PUBLIC_EXTRA_ALLOWED_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}
