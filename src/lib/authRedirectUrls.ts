import { getConfiguredSiteOrigin } from "@/lib/siteOrigin";

/** Browser origin for Supabase email redirect URLs. */
export function authSiteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return getConfiguredSiteOrigin();
}

export function emailVerificationRedirectUrl(): string {
  return `${authSiteOrigin()}/email-verified`;
}

export function passwordResetRedirectUrl(): string {
  return `${authSiteOrigin()}/reset-password`;
}
