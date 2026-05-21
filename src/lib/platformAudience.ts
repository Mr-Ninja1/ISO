import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

export type AnnouncementAudience = "all" | "native" | "web";
export type PlatformClientKind = "native" | "web";

export function resolvePlatformClientKind(): PlatformClientKind {
  return isCapacitorNativeApp() ? "native" : "web";
}

export function normalizeAnnouncementAudience(value: unknown): AnnouncementAudience {
  if (value === "native" || value === "web") return value;
  return "all";
}

export function announcementAudienceMatches(
  audience: unknown,
  client: PlatformClientKind
): boolean {
  const a = normalizeAnnouncementAudience(audience);
  if (a === "all") return true;
  return a === client;
}

/** Append ?client=native|web for /api/tenant-alerts filtering. */
export function appendTenantAlertsClientParams(url: URL) {
  url.searchParams.set("client", resolvePlatformClientKind());
}
