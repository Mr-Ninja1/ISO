"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const settingsBase = `/${tenantSlug}/settings`;
  const auditsBase = `/${tenantSlug}/audits`;
  const dashboardBase = `/${tenantSlug}/dashboard`;
  const activityBase = `/${tenantSlug}/activity`;
  const onAudits = pathname?.startsWith(auditsBase) ?? false;
  const onSettings = pathname?.startsWith(settingsBase) ?? false;
  const onActivity = pathname?.startsWith(activityBase) ?? false;
  const onDashboard = pathname?.startsWith(dashboardBase) ?? false;
  const onTemplates = pathname?.startsWith(`/${tenantSlug}/templates`) ?? false;
  const onCategories = pathname?.startsWith(`/${tenantSlug}/categories`) ?? false;
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

  // Hide global tenant nav on the custom form builder page to free header space.
  if (pathname === `/${tenantSlug}/templates/new`) {
    return null;
  }

  return (
    <>
      <nav className="hidden items-center gap-2 text-sm sm:flex">
        <Link
          href={`/${tenantSlug}/audits`}
          className={
            "rounded-md border px-3 py-2 " +
            (onAudits
              ? "border-foreground bg-foreground text-background"
              : "border-foreground/20")
          }
        >
          Forms
        </Link>
        {caps.canSeeAdminRoutes ? (
          <Link
            href={dashboardBase}
            className={
              "rounded-md border px-3 py-2 " +
              (onDashboard
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/20")
            }
          >
            Dashboard
          </Link>
        ) : null}
        <details className="relative">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-foreground/20">
            <MoreVertical className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 top-11 z-30 min-w-48 rounded-md border border-foreground/20 bg-background p-1 shadow-sm">
            {caps.canSeeAdminRoutes ? (
              <Link
                href={`/${tenantSlug}/activity`}
                className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onActivity ? "bg-foreground text-background" : "")}
              >
                Activity
              </Link>
            ) : null}
            {caps.canCreateForms ? (
              <Link
                href={`/${tenantSlug}/templates`}
                className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onTemplates ? "bg-foreground text-background" : "")}
              >
                Templates
              </Link>
            ) : null}
            {caps.canSeeAdminRoutes ? (
              <>
                <Link
                  href={settingsBase}
                  className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onSettings ? "bg-foreground text-background" : "")}
                >
                  Settings
                </Link>
                <Link
                  href={`/${tenantSlug}/categories`}
                  className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onCategories ? "bg-foreground text-background" : "")}
                >
                  Categories
                </Link>
              </>
            ) : null}
            <Link
              href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
              className="mt-1 block rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
            >
              Workspace
            </Link>
            <Link href="/dashboard" className="block rounded-md px-3 py-2 text-sm hover:bg-foreground/5">
              Lobby
            </Link>
          </div>
        </details>
      </nav>

      <details className="relative sm:hidden">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-foreground/20">
          <MoreVertical className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 top-11 z-30 min-w-44 rounded-md border border-foreground/20 bg-background p-1 shadow-sm">
          <Link
            href={`/${tenantSlug}/audits`}
            className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onAudits ? "bg-foreground text-background" : "")}
          >
            Forms
          </Link>
          {caps.canSeeAdminRoutes ? (
            <Link
              href={`/${tenantSlug}/activity`}
              className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onActivity ? "bg-foreground text-background" : "")}
            >
              Activity
            </Link>
          ) : null}
          {caps.canCreateForms ? (
            <Link
              href={`/${tenantSlug}/templates`}
              className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onTemplates ? "bg-foreground text-background" : "")}
            >
              Templates
            </Link>
          ) : null}
          {caps.canSeeAdminRoutes ? (
            <>
              <Link
                href={settingsBase}
                className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onSettings ? "bg-foreground text-background" : "")}
              >
                Settings
              </Link>
              <Link
                href={`/${tenantSlug}/categories`}
                className={"block rounded-md px-3 py-2 text-sm hover:bg-foreground/5 " + (onCategories ? "bg-foreground text-background" : "")}
              >
                Categories
              </Link>
            </>
          ) : null}
          <Link
            href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
            className="mt-1 block rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
          >
            Workspace
          </Link>
          <Link href="/dashboard" className="block rounded-md px-3 py-2 text-sm hover:bg-foreground/5">
            Lobby
          </Link>
        </div>
      </details>
    </>
  );
}
