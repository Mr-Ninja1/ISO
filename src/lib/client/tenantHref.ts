import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { CAPACITOR_EXPORT_TENANT_SLUG } from "@/lib/capacitor/staticExport";
import { normalizeTenantSlug } from "@/lib/client/resolveTenantSlug";

/**
 * Build a tenant-scoped href that works on web and Capacitor static export (`/_/` routes + tenantSlug query).
 */
export function buildTenantHref(
  tenantSlug: string,
  pathAfterTenant: string,
  query?: Record<string, string | null | undefined>
) {
  const slug = normalizeTenantSlug(tenantSlug);
  const subpath = pathAfterTenant.replace(/^\//, "");
  const routePrefix = isCapacitorNativeApp() && slug ? CAPACITOR_EXPORT_TENANT_SLUG : slug;
  const base = routePrefix ? `/${routePrefix}/${subpath}` : `/${subpath}`;

  const params = new URLSearchParams();
  if (isCapacitorNativeApp() && slug) {
    params.set("tenantSlug", slug);
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && String(value).trim() !== "") {
        params.set(key, String(value));
      }
    }
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Saved form report — on Capacitor uses static `/_/audits/_` + auditId query (real UUID paths 404 → workspace).
 */
export function buildAuditReportHref(tenantSlug: string, auditId: string) {
  const id = (auditId || "").trim();
  if (!id) return buildTenantHref(tenantSlug, "audits");
  if (isCapacitorNativeApp()) {
    return buildTenantHref(tenantSlug, "audits/_", { auditId: id });
  }
  return buildTenantHref(tenantSlug, `audits/${id}`);
}
