"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

  useEffect(() => {
    setLoadingPath(null);
  }, [pathname]);

  useEffect(() => {
    if (!loadingPath) return;
    const timer = window.setTimeout(() => setLoadingPath(null), 4000);
    return () => window.clearTimeout(timer);
  }, [loadingPath]);

  const handleLinkClick = (path: string) => {
    setLoadingPath(path);
  };

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
        <Link
          href={formsPath}
          className={tabClass(pathActive(formsPath) && !pathActive(offlinePath))}
          onClick={() => handleLinkClick(formsPath)}
          prefetch
        >
          {loadingPath === formsPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Saved forms
        </Link>
        <Link
          href={offlinePath}
          className={tabClass(pathActive(offlinePath))}
          onClick={() => handleLinkClick(offlinePath)}
          prefetch
        >
          {loadingPath === offlinePath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Offline
        </Link>
        {caps.canSeeAdminRoutes ? (
          <Link
            href={activityPath}
            className={tabClass(pathActive(activityPath))}
            onClick={() => handleLinkClick(activityPath)}
            prefetch
          >
            {loadingPath === activityPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Activity
          </Link>
        ) : null}
        {caps.canSeeAdminRoutes ? (
          <Link
            href={correctiveActionsPath}
            className={tabClass(pathActive(correctiveActionsPath))}
            onClick={() => handleLinkClick(correctiveActionsPath)}
            prefetch
          >
            {loadingPath === correctiveActionsPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Actions
          </Link>
        ) : null}
        {caps.canCreateForms ? (
          <Link
            href={templatesPath}
            className={tabClass(pathActive(templatesPath))}
            onClick={() => handleLinkClick(templatesPath)}
            prefetch
          >
            {loadingPath === templatesPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Templates
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
