"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAppOffline } from "@/lib/client/appOffline";
import { defaultOfflineBackHref, isOfflineSafePath } from "@/lib/client/offlineNavigation";
import { showRequiresInternetDialog } from "@/components/RequiresInternetDialog";
import { INTERNET_REQUIRED_MESSAGE } from "@/lib/client/internetRequired";
import { normalizeTenantSlug } from "@/lib/client/resolveTenantSlug";

function tenantSlugFromPath(pathname: string) {
  if (typeof window !== "undefined") {
    const fromQuery = normalizeTenantSlug(new URLSearchParams(window.location.search).get("tenantSlug"));
    if (fromQuery) return fromQuery;
  }

  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const reserved = new Set(["workspace", "login", "signup", "onboarding", "offline", "admin", "_"]);
  if (reserved.has(parts[0])) return null;
  return normalizeTenantSlug(parts[0]);
}

/**
 * Redirects away from online-only routes when the device is offline (Capacitor / PWA).
 * Safe routes (workspace, cached audits) keep working from local storage.
 */
export function OfflineNavigationGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || !isAppOffline()) return;
    if (isOfflineSafePath(pathname)) return;

    const tenantSlug = tenantSlugFromPath(pathname);
    const back = defaultOfflineBackHref(tenantSlug);

    showRequiresInternetDialog("This page", INTERNET_REQUIRED_MESSAGE);
    router.replace(back);
  }, [pathname, router]);

  return null;
}
