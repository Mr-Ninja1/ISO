"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAppOffline } from "@/lib/client/appOffline";
import { defaultOfflineBackHref, isOfflineSafePath } from "@/lib/client/offlineNavigation";
import { showRequiresInternetDialog } from "@/components/RequiresInternetDialog";
import { INTERNET_REQUIRED_MESSAGE } from "@/lib/client/internetRequired";

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

    const tenantMatch = pathname.match(/^\/([^/]+)\//);
    const tenantSlug = tenantMatch?.[1] || null;
    const back = defaultOfflineBackHref(tenantSlug);

    showRequiresInternetDialog("This page", INTERNET_REQUIRED_MESSAGE);
    router.replace(back);
  }, [pathname, router]);

  return null;
}
