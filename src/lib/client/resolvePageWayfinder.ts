import { buildTenantHref } from "@/lib/client/tenantHref";
import { buildWorkspaceFormsHref } from "@/lib/client/workspaceNavigation";

export type PageWayfinderConfig = {
  backHref: string;
  backLabel: string;
  workspaceHref: string;
};

/** Back + home targets for tenant-scoped pages (no full-width nav bar). */
export function resolvePageWayfinder(
  pathname: string | null,
  tenantSlug: string
): PageWayfinderConfig | null {
  if (!pathname || !tenantSlug) return null;

  const workspaceHref = buildWorkspaceFormsHref(tenantSlug);
  const adminHref = `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}&view=admin`;
  const auditsHref = buildTenantHref(tenantSlug, "audits");

  if (pathname === auditsHref || /\/audits\/?$/.test(pathname)) {
    return { backHref: workspaceHref, backLabel: "Workspace", workspaceHref };
  }

  if (pathname.includes("/audits/new")) {
    return { backHref: auditsHref, backLabel: "Saved forms", workspaceHref };
  }

  if (
    (pathname.includes("/audits/") || pathname.includes("/audits/_")) &&
    !pathname.endsWith("/local") &&
    !pathname.endsWith("/offline-last") &&
    !pathname.endsWith("/new")
  ) {
    return { backHref: auditsHref, backLabel: "Saved forms", workspaceHref };
  }

  if (
    pathname.includes("/settings") ||
    pathname.includes("/categories") ||
    pathname.includes("/templates") ||
    pathname.includes("/activity") ||
    pathname.includes("/dashboard") ||
    pathname.includes("/corrective-actions")
  ) {
    return { backHref: adminHref, backLabel: "Admin", workspaceHref };
  }

  return { backHref: workspaceHref, backLabel: "Workspace", workspaceHref };
}
