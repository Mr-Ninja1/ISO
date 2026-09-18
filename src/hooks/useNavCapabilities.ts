"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  fetchNavCapabilities,
  readCachedNavCapabilities,
  type NavCapabilities,
} from "@/lib/client/navCapabilities";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

/** Shared nav capabilities — memory/storage cache + single in-flight fetch per tenant. */
export function useNavCapabilities(tenantSlug: string) {
  const { session } = useAuth();
  const [caps, setCaps] = useState<NavCapabilities>(() => {
    if (!tenantSlug) return DEFAULT_CAPS;
    return readCachedNavCapabilities(tenantSlug) || DEFAULT_CAPS;
  });

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

  return caps;
}
