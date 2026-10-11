"use client";

import { usePathname, useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { SoftNavLink } from "@/components/SoftNavLink";
import { buildGeneralSupportMailto } from "@/lib/supportContact";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { showRequiresInternetDialog } from "@/components/RequiresInternetDialog";
import { HeaderKebabMenu, HeaderMenuItem } from "@/components/ui/HeaderKebabMenu";
import { buildTenantHref } from "@/lib/client/tenantHref";
import { buildWorkspaceFormsHref } from "@/lib/client/workspaceNavigation";
import { useNavCapabilities } from "@/hooks/useNavCapabilities";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";

function navLinkClass(active: boolean) {
  return (
    "nav-pressable rounded-xl border px-4 py-2 font-medium transition-all " +
    (active
      ? "border-foreground bg-foreground text-background shadow-md"
      : "border-border bg-surface/90 text-foreground hover:border-border-strong hover:bg-surface hover:shadow-sm")
  );
}

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const offline = useAppOffline();
  const caps = useNavCapabilities(tenantSlug);
  const settingsBase = buildTenantHref(tenantSlug, "settings");
  const auditsBase = buildTenantHref(tenantSlug, "audits");
  const dashboardBase = buildTenantHref(tenantSlug, "dashboard");
  const correctiveActionsBase = buildTenantHref(tenantSlug, "corrective-actions");
  const activityBase = buildTenantHref(tenantSlug, "activity");
  const templatesBase = buildTenantHref(tenantSlug, "templates");
  const categoriesBase = buildTenantHref(tenantSlug, "categories");
  const workspaceHref = buildWorkspaceFormsHref(tenantSlug);

  const onAudits = pathname?.includes("/audits") ?? false;
  const onSettings = pathname?.includes("/settings") ?? false;
  const onActivity = pathname?.includes("/activity") ?? false;
  const onDashboard = pathname?.includes("/dashboard") ?? false;
  const onCorrectiveActions = pathname?.includes("/corrective-actions") ?? false;
  const onTemplates = pathname?.includes("/templates") ?? false;
  const onCategories = pathname?.includes("/categories") ?? false;

  const softGo = (href: string) => {
    navigateWithFeedback(router, href, "push", { silent: true });
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
      <HeaderMenuItem
        href={auditsBase}
        className={onAudits ? "bg-foreground text-background" : ""}
        onClick={(e) => {
          e.preventDefault();
          softGo(auditsBase);
        }}
      >
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
            e.preventDefault();
            softGo(dashboardBase);
          }}
        >
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
            e.preventDefault();
            softGo(correctiveActionsBase);
          }}
        >
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
            e.preventDefault();
            softGo(activityBase);
          }}
        >
          Activity
        </HeaderMenuItem>
      ) : null}

      {caps.canCreateForms ? (
        <HeaderMenuItem
          href={templatesBase}
          className={onTemplates ? "bg-foreground text-background" : ""}
          onClick={(e) => {
            e.preventDefault();
            softGo(templatesBase);
          }}
        >
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
              e.preventDefault();
              softGo(settingsBase);
            }}
          >
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
              e.preventDefault();
              softGo(categoriesBase);
            }}
          >
            Categories
          </HeaderMenuItem>
        </>
      ) : null}

      <HeaderMenuItem
        href={workspaceHref}
        onClick={(e) => {
          e.preventDefault();
          softGo(workspaceHref);
        }}
      >
        Workspace
      </HeaderMenuItem>

      <HeaderMenuItem href={buildGeneralSupportMailto()}>
        <Mail className="h-4 w-4" />
        Contact support
      </HeaderMenuItem>
    </>
  );

  return (
    <nav className="flex items-center gap-2 text-sm">
      <SoftNavLink
        href={auditsBase}
        active={onAudits}
        className={(active) => "hidden sm:inline-flex " + navLinkClass(active)}
      >
        Saved forms
      </SoftNavLink>
      <HeaderKebabMenu label="More navigation" menuClassName="w-52">
        {menuItems}
      </HeaderKebabMenu>
    </nav>
  );
}
