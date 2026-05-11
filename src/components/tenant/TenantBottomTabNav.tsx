"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";
import { Loader2 } from "lucide-react";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

function tabClass(active: boolean, loading: boolean) {
  return (
    "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-xs font-medium transition-all " +
    (active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
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
  const [loadingPath, setLoadingPath] = useState<string | null>(null);

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

  const handleLinkClick = (path: string) => {
    setLoadingPath(path);
    setTimeout(() => setLoadingPath(null), 500);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-2 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-[760px] items-center gap-1">
        <Link 
          href={formsPath} 
          className={tabClass(pathname?.startsWith(formsPath) ?? false, loadingPath === formsPath)}
          onClick={() => handleLinkClick(formsPath)}
        >
          {loadingPath === formsPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Saved forms
        </Link>
        <Link 
          href={offlinePath} 
          className={tabClass(pathname?.startsWith(offlinePath) ?? false, loadingPath === offlinePath)}
          onClick={() => handleLinkClick(offlinePath)}
        >
          {loadingPath === offlinePath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Offline
        </Link>
        {caps.canSeeAdminRoutes ? (
          <Link 
            href={activityPath} 
            className={tabClass(pathname?.startsWith(activityPath) ?? false, loadingPath === activityPath)}
            onClick={() => handleLinkClick(activityPath)}
          >
            {loadingPath === activityPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Activity
          </Link>
        ) : null}
        {caps.canSeeAdminRoutes ? (
          <Link 
            href={correctiveActionsPath} 
            className={tabClass(pathname?.startsWith(correctiveActionsPath) ?? false, loadingPath === correctiveActionsPath)}
            onClick={() => handleLinkClick(correctiveActionsPath)}
          >
            {loadingPath === correctiveActionsPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Actions
          </Link>
        ) : null}
        {caps.canCreateForms ? (
          <Link 
            href={templatesPath} 
            className={tabClass(pathname === templatesPath, loadingPath === templatesPath)}
            onClick={() => handleLinkClick(templatesPath)}
          >
            {loadingPath === templatesPath ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Templates
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
