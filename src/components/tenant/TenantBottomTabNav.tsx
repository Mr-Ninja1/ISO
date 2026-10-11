"use client";

import { usePathname } from "next/navigation";
import { SoftNavLink } from "@/components/SoftNavLink";
import { useNavCapabilities } from "@/hooks/useNavCapabilities";
import { buildTenantHref } from "@/lib/client/tenantHref";

function tabClass(active: boolean) {
  return (
    "nav-pressable inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-xs font-medium transition-all " +
    (active ? "bg-[var(--hse-teal)] text-white shadow-sm" : "text-[var(--hse-teal-mid)] hover:bg-[var(--hse-sky)]")
  );
}

export function TenantBottomTabNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const caps = useNavCapabilities(tenantSlug);
  const formsPath = buildTenantHref(tenantSlug, "audits");
  const offlinePath = buildTenantHref(tenantSlug, "audits/local");
  const activityPath = buildTenantHref(tenantSlug, "activity");
  const correctiveActionsPath = buildTenantHref(tenantSlug, "corrective-actions");
  const templatesPath = buildTenantHref(tenantSlug, "templates");

  const pathActive = (href: string) => {
    if (!pathname) return false;
    try {
      const target = new URL(href, "https://local.invalid");
      return pathname.startsWith(target.pathname);
    } catch {
      return pathname.includes(href.split("?")[0] || href);
    }
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color-mix(in_srgb,var(--hse-teal)_15%,transparent)] bg-[var(--hse-cream)]/98 p-2 md:hidden">
      <div className="mx-auto flex max-w-[760px] items-center gap-1">
        <SoftNavLink
          href={formsPath}
          active={pathActive(formsPath) && !pathActive(offlinePath)}
          className={tabClass}
        >
          Saved forms
        </SoftNavLink>
        <SoftNavLink href={offlinePath} active={pathActive(offlinePath)} className={tabClass}>
          Offline
        </SoftNavLink>
        {caps.canSeeAdminRoutes ? (
          <SoftNavLink href={activityPath} active={pathActive(activityPath)} className={tabClass}>
            Activity
          </SoftNavLink>
        ) : null}
        {caps.canSeeAdminRoutes ? (
          <SoftNavLink
            href={correctiveActionsPath}
            active={pathActive(correctiveActionsPath)}
            className={tabClass}
          >
            Actions
          </SoftNavLink>
        ) : null}
        {caps.canCreateForms ? (
          <SoftNavLink href={templatesPath} active={pathActive(templatesPath)} className={tabClass}>
            Templates
          </SoftNavLink>
        ) : null}
      </div>
    </nav>
  );
}
