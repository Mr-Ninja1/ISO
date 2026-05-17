/** Placeholder slug used when exporting the app for Capacitor (real slug comes from the URL at runtime). */
export const CAPACITOR_EXPORT_TENANT_SLUG = "_";

export function capacitorTenantStaticParams() {
  return [{ tenantSlug: CAPACITOR_EXPORT_TENANT_SLUG }];
}

export function capacitorAuditStaticParams() {
  return [{ tenantSlug: CAPACITOR_EXPORT_TENANT_SLUG, auditId: "_" }];
}
