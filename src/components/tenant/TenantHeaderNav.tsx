"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { showRequiresInternetDialog } from "@/components/RequiresInternetDialog";
import { HeaderKebabMenu, HeaderMenuItem } from "@/components/ui/HeaderKebabMenu";
import { buildTenantHref } from "@/lib/client/tenantHref";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

function navLinkClass(active: boolean) {
  return (
    "rounded-xl border px-4 py-2 font-medium transition-all " +
    (active
      ? "border-foreground bg-foreground text-background shadow-md"
      : "border-border bg-surface/90 text-foreground hover:border-border-strong hover:bg-surface hover:shadow-sm")
  );
}

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const offline = useAppOffline();
  const settingsBase = buildTenantHref(tenantSlug, "settings");
  const auditsBase = buildTenantHref(tenantSlug, "audits");
  const dashboardBase = buildTenantHref(tenantSlug, "dashboard");
  const correctiveActionsBase = buildTenantHref(tenantSlug, "corrective-actions");
  const activityBase = buildTenantHref(tenantSlug, "activity");
  const templatesBase = buildTenantHref(tenantSlug, "templates");
  const categoriesBase = buildTenantHref(tenantSlug, "categories");
  const workspaceHref = `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`;

  const onAudits = pathname?.includes("/audits") ?? false;
  const onSettings = pathname?.includes("/settings") ?? false;
  const onActivity = pathname?.includes("/activity") ?? false;
  const onDashboard = pathname?.includes("/dashboard") ?? false;
  const onCorrectiveActions = pathname?.includes("/corrective-actions") ?? false;
  const onTemplates = pathname?.includes("/templates") ?? false;
  const onCategories = pathname?.includes("/categories") ?? false;

  const [caps, setCaps] = useState<NavCapabilities>(DEFAULT_CAPS);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  useEffect(() => {
    const token = session?.access_token || "";
    if (!token || !tenantSlug) return;

    let cancelled = false;
    const cached = readCachedNavCapabilities(tenantSlug);
    if (cached) setCaps(cached);

    fetchNavCapabilities(token, tenantSlug)
      .then((nextCaps) => {
        if (!cancelled) setCaps(nextCaps);
      })
      .catch(() => {
        if (!cancelled) setCaps(DEFAULT_CAPS);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, tenantSlug]);

  const handleLinkClick = (path: string) => {
    setLoadingPath(path);
    setTimeout(() => setLoadingPath(null), 500);
  };

  const blockOffline = (label: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    showRequiresInternetDialog(label);
  };

  if (pathname?.includes("/templates/new")) {
    return null;
  }

  const menuItems = (
    <>
      <HeaderMenuItem href={auditsBase} className={onAudits ? "bg-foreground text-background" : ""} onClick={() => handleLinkClick(auditsBase)}>
        {loadingPath === auditsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Saved forms
      </HeaderMenuItem>

      {caps.canSeeAdminRoutes ? (
        <HeaderMenuItem
          href={dashboardBase}
          className={onDashboard ? "bg-foreground text-background" : ""}
          onClick={(e) => {
            if (offline) {
              e.preventDefault();
              blockOffline("Dashboard");
              return;
            }
            handleLinkClick(dashboardBase);
          }}
        >
          {loadingPath === dashboardBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Dashboard
        </HeaderMenuItem>
      ) : null}

      {caps.canSeeAdminRoutes ? (
        <HeaderMenuItem
          href={correctiveActionsBase}
          className={onCorrectiveActions ? "bg-foreground text-background" : ""}
          onClick={(e) => {
            if (offline) {
              e.preventDefault();
              blockOffline("Corrective actions");
              return;
            }
            handleLinkClick(correctiveActionsBase);
          }}
        >
          {loadingPath === correctiveActionsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Corrective actions
        </HeaderMenuItem>
      ) : null}

      {caps.canSeeAdminRoutes ? (
        <HeaderMenuItem
          href={activityBase}
          className={onActivity ? "bg-foreground text-background" : ""}
          onClick={(e) => {
            if (offline) {
              e.preventDefault();
              blockOffline("Activity");
              return;
            }
            handleLinkClick(activityBase);
          }}
        >
          {loadingPath === activityBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Activity
        </HeaderMenuItem>
      ) : null}

      {caps.canCreateForms ? (
        <HeaderMenuItem
          href={templatesBase}
          className={onTemplates ? "bg-foreground text-background" : ""}
          onClick={(e) => {
            if (offline) {
              e.preventDefault();
              blockOffline("Templates");
              return;
            }
            handleLinkClick(templatesBase);
          }}
        >
          {loadingPath === templatesBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Templates
        </HeaderMenuItem>
      ) : null}

      {caps.canSeeAdminRoutes ? (
        <>
          <HeaderMenuItem
            href={settingsBase}
            className={onSettings ? "bg-foreground text-background" : ""}
            onClick={(e) => {
              if (offline) {
                e.preventDefault();
                blockOffline("Settings");
                return;
              }
              handleLinkClick(settingsBase);
            }}
          >
            {loadingPath === settingsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Settings
          </HeaderMenuItem>
          <HeaderMenuItem
            href={categoriesBase}
            className={onCategories ? "bg-foreground text-background" : ""}
            onClick={(e) => {
              if (offline) {
                e.preventDefault();
                blockOffline("Categories");
                return;
              }
              handleLinkClick(categoriesBase);
            }}
          >
            {loadingPath === categoriesBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Categories
          </HeaderMenuItem>
        </>
      ) : null}

      <HeaderMenuItem href={workspaceHref} onClick={() => handleLinkClick(workspaceHref)}>
        {loadingPath === workspaceHref ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Workspace
      </HeaderMenuItem>
    </>
  );

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link href={auditsBase} onClick={() => handleLinkClick(auditsBase)} className={"hidden sm:inline-flex " + navLinkClass(onAudits)}>
        {loadingPath === auditsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Saved forms
      </Link>
      <HeaderKebabMenu label="More navigation" menuClassName="w-52">
        {menuItems}
      </HeaderKebabMenu>
    </nav>
  );
}
