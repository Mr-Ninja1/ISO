"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";
import { buildTenantHref } from "@/lib/client/tenantHref";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

export function AdminBackButton({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
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

  if (caps.canSeeAdminRoutes) {
    return (
      <Link
        href={buildTenantHref(tenantSlug, "dashboard")}
        className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
      >
        Back to admin
      </Link>
    );
  }

  return (
    <Link
      href={buildTenantHref(tenantSlug, "audits")}
      className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
    >
      View saved forms
    </Link>
  );
}
