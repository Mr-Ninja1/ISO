import { PLATFORM_SITE_ORIGIN } from "@/lib/platform";

/** Browser origin for Supabase email redirect URLs. */
export function authSiteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return PLATFORM_SITE_ORIGIN;
}

export function emailVerificationRedirectUrl(): string {
  return `${authSiteOrigin()}/email-verified`;
}

export function passwordResetRedirectUrl(): string {
  return `${authSiteOrigin()}/reset-password`;
}
