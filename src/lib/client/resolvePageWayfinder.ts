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

  const workspaceHref = `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`;
  const adminHref = `/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}&view=admin`;
  const auditsHref = `/${tenantSlug}/audits`;

  if (pathname === `/${tenantSlug}/audits`) {
    return { backHref: workspaceHref, backLabel: "Workspace", workspaceHref };
  }

  if (pathname === `/${tenantSlug}/audits/new`) {
    return { backHref: auditsHref, backLabel: "Saved forms", workspaceHref };
  }

  if (/^\/[^/]+\/audits\/[^/]+$/.test(pathname) && !pathname.endsWith("/local") && !pathname.endsWith("/offline-last")) {
    return { backHref: auditsHref, backLabel: "Saved forms", workspaceHref };
  }

  if (pathname.startsWith(`/${tenantSlug}/audits/`)) {
    return { backHref: auditsHref, backLabel: "Saved forms", workspaceHref };
  }

  if (
    pathname.startsWith(`/${tenantSlug}/settings`) ||
    pathname.startsWith(`/${tenantSlug}/categories`) ||
    pathname.startsWith(`/${tenantSlug}/templates`) ||
    pathname.startsWith(`/${tenantSlug}/activity`) ||
    pathname.startsWith(`/${tenantSlug}/dashboard`) ||
    pathname.startsWith(`/${tenantSlug}/corrective-actions`)
  ) {
    return { backHref: adminHref, backLabel: "Admin", workspaceHref };
  }

  return { backHref: workspaceHref, backLabel: "Workspace", workspaceHref };
}
