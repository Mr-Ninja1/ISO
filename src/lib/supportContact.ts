/** Client-safe support contact (uses NEXT_PUBLIC_PLATFORM_SUPPORT_EMAIL). */

export function getSupportEmail(): string {
  if (typeof process === "undefined") return "";
  return process.env.NEXT_PUBLIC_PLATFORM_SUPPORT_EMAIL?.trim() || "";
}

export function buildGeneralSupportMailto(options?: {
  subject?: string;
  body?: string;
  brandName?: string;
  tenantSlug?: string;
}) {
  const subject =
    options?.subject ||
    (options?.brandName ? `Support — ${options.brandName}` : "ISO Grid support request");
  const body =
    options?.body ||
    [
      "Hi,",
      "",
      "I need help with:",
      "",
      options?.tenantSlug ? `Brand: /${options.tenantSlug}` : "",
      "",
      "Thanks",
    ]
      .filter(Boolean)
      .join("\n");

  const params = new URLSearchParams();
  params.set("subject", subject);
  params.set("body", body);
  const qs = params.toString();
  const email = getSupportEmail();
  return email ? `mailto:${email}?${qs}` : `mailto:?${qs}`;
}

export function hasSupportEmailConfigured(): boolean {
  return Boolean(getSupportEmail());
}
