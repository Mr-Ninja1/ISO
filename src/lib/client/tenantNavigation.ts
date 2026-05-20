import { buildAuditReportHref, buildTenantHref } from "@/lib/client/tenantHref";

type AppRouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Client navigation that works on web (/brand/…) and Capacitor static export (/_/…?tenantSlug=). */
export function pushTenantRoute(
  router: Pick<AppRouterLike, "push" | "replace">,
  tenantSlug: string,
  pathAfterTenant: string,
  query?: Record<string, string | null | undefined>,
  method: "push" | "replace" = "push"
) {
  const href = buildTenantHref(tenantSlug, pathAfterTenant, query);
  router[method](href);
}

export function tenantRouteHref(
  tenantSlug: string,
  pathAfterTenant: string,
  query?: Record<string, string | null | undefined>
) {
  return buildTenantHref(tenantSlug, pathAfterTenant, query);
}

export function auditReportHref(tenantSlug: string, auditId: string) {
  return buildAuditReportHref(tenantSlug, auditId);
}
