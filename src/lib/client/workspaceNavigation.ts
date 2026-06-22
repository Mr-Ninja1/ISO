/** Canonical workspace URLs — avoid /workspace/forms redirect hop (breaks Capacitor static export). */
export function buildWorkspaceFormsHref(tenantSlug: string) {
  const slug = (tenantSlug || "").trim();
  if (!slug) return "/workspace";
  return `/workspace?tenantSlug=${encodeURIComponent(slug)}&view=forms`;
}

export function buildWorkspaceAdminHref(tenantSlug: string) {
  const slug = (tenantSlug || "").trim();
  if (!slug) return "/workspace";
  return `/workspace?tenantSlug=${encodeURIComponent(slug)}&view=admin`;
}
