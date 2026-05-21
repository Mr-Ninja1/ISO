const DEFAULT_SITE_ORIGIN = "https://isopro.me";

/** Browser origin for Supabase email redirect URLs. */
export function authSiteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}

export function emailVerificationRedirectUrl(): string {
  return `${authSiteOrigin()}/email-verified`;
}

export function passwordResetRedirectUrl(): string {
  return `${authSiteOrigin()}/reset-password`;
}
