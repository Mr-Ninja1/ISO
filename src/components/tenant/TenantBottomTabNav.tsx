"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

function tabClass(active: boolean) {
  return (
    "inline-flex h-10 flex-1 items-center justify-center rounded-md text-xs font-medium " +
    (active ? "bg-foreground text-background" : "text-foreground/75")
  );
}

export function TenantBottomTabNav({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const formsPath = `/${tenantSlug}/audits`;
  const offlinePath = `/${tenantSlug}/audits/local`;
  const activityPath = `/${tenantSlug}/activity`;
  const correctiveActionsPath = `/${tenantSlug}/corrective-actions`;
  const templatesPath = `/${tenantSlug}/templates`;
  const [caps, setCaps] = useState<NavCapabilities>(DEFAULT_CAPS);

  useEffect(() => {
    const token = session?.access_token || "";
    if (!token || !tenantSlug) return;

    let cancelled = false;
    const cached = readCachedNavCapabilities(tenantSlug);
    if (cached) {
      setCaps(cached);
    }

    fetchNavCapabilities(token, tenantSlug)
      .then((nextCaps) => {
        if (cancelled) return;
        setCaps(nextCaps);
      })
      .catch(() => {
        if (cancelled) return;
        setCaps(DEFAULT_CAPS);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, tenantSlug]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-background/95 p-2 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-[760px] items-center gap-1">
        <Link href={formsPath} className={tabClass(pathname?.startsWith(formsPath) ?? false)}>
          Forms
        </Link>
        <Link href={offlinePath} className={tabClass(pathname?.startsWith(offlinePath) ?? false)}>
          Offline
        </Link>
        {caps.canSeeAdminRoutes ? (
          <Link href={activityPath} className={tabClass(pathname?.startsWith(activityPath) ?? false)}>
            Activity
          </Link>
        ) : null}
        {caps.canSeeAdminRoutes ? (
          <Link href={correctiveActionsPath} className={tabClass(pathname?.startsWith(correctiveActionsPath) ?? false)}>
            Actions
          </Link>
        ) : null}
        {caps.canCreateForms ? (
          <Link href={templatesPath} className={tabClass(pathname === templatesPath)}>
            Templates
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
