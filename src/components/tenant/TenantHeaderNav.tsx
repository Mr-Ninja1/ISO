"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreVertical, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { fetchNavCapabilities, readCachedNavCapabilities, type NavCapabilities } from "@/lib/client/navCapabilities";

const DEFAULT_CAPS: NavCapabilities = { canSeeAdminRoutes: false, canCreateForms: false };

export function TenantHeaderNav({ tenantSlug }: { tenantSlug: string }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const settingsBase = `/${tenantSlug}/settings`;
  const auditsBase = `/${tenantSlug}/audits`;
  const dashboardBase = `/${tenantSlug}/dashboard`;
  const correctiveActionsBase = `/${tenantSlug}/corrective-actions`;
  const activityBase = `/${tenantSlug}/activity`;
  const onAudits = pathname?.startsWith(auditsBase) ?? false;
  const onSettings = pathname?.startsWith(settingsBase) ?? false;
  const onActivity = pathname?.startsWith(activityBase) ?? false;
  const onDashboard = pathname?.startsWith(dashboardBase) ?? false;
  const onCorrectiveActions = pathname?.startsWith(correctiveActionsBase) ?? false;
  const onTemplates = pathname?.startsWith(`/${tenantSlug}/templates`) ?? false;
  const onCategories = pathname?.startsWith(`/${tenantSlug}/categories`) ?? false;
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

  // Hide global tenant nav on the custom form builder page to free header space.
  if (pathname === `/${tenantSlug}/templates/new`) {
    return null;
  }

  return (
    <>
      <nav className="hidden items-center gap-2 text-sm sm:flex">
        <Link
          href={`/${tenantSlug}/audits`}
          onClick={() => handleLinkClick(auditsBase)}
          className={
            "rounded-xl border px-4 py-2 font-medium transition-all " +
            (onAudits
              ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
              : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-md")
          }
        >
          {loadingPath === auditsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Saved forms
        </Link>
        {caps.canSeeAdminRoutes ? (
          <Link
            href={dashboardBase}
            onClick={() => handleLinkClick(dashboardBase)}
            className={
              "rounded-xl border px-4 py-2 font-medium transition-all " +
              (onDashboard
                ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
                : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-md")
            }
          >
            {loadingPath === dashboardBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Dashboard
          </Link>
        ) : null}
        {caps.canSeeAdminRoutes ? (
          <Link
            href={correctiveActionsBase}
            onClick={() => handleLinkClick(correctiveActionsBase)}
            className={
              "rounded-xl border px-4 py-2 font-medium transition-all " +
              (onCorrectiveActions
                ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
                : "border-slate-200 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white hover:shadow-md")
            }
          >
            {loadingPath === correctiveActionsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Actions
          </Link>
        ) : null}
        <details className="relative">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition-all hover:border-slate-300 hover:bg-white hover:shadow-md">
            <MoreVertical className="h-4 w-4" />
          </summary>
          <div className="absolute right-0 top-11 z-30 min-w-48 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
            {caps.canSeeAdminRoutes ? (
              <Link
                href={`/${tenantSlug}/activity`}
                onClick={() => handleLinkClick(activityBase)}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onActivity ? "bg-slate-900 text-white" : "text-slate-700")}
              >
                {loadingPath === activityBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Activity
              </Link>
            ) : null}
            {caps.canCreateForms ? (
              <Link
                href={`/${tenantSlug}/templates`}
                onClick={() => handleLinkClick(`/${tenantSlug}/templates`)}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onTemplates ? "bg-slate-900 text-white" : "text-slate-700")}
              >
                {loadingPath === `/${tenantSlug}/templates` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Templates
              </Link>
            ) : null}
            {caps.canSeeAdminRoutes ? (
              <>
                <Link
                  href={correctiveActionsBase}
                  onClick={() => handleLinkClick(correctiveActionsBase)}
                  className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onCorrectiveActions ? "bg-slate-900 text-white" : "text-slate-700")}
                >
                  {loadingPath === correctiveActionsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Corrective actions
                </Link>
                <Link
                  href={settingsBase}
                  onClick={() => handleLinkClick(settingsBase)}
                  className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onSettings ? "bg-slate-900 text-white" : "text-slate-700")}
                >
                  {loadingPath === settingsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Settings
                </Link>
                <Link
                  href={`/${tenantSlug}/categories`}
                  onClick={() => handleLinkClick(`/${tenantSlug}/categories`)}
                  className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onCategories ? "bg-slate-900 text-white" : "text-slate-700")}
                >
                  {loadingPath === `/${tenantSlug}/categories` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Categories
                </Link>
              </>
            ) : null}
            <Link
              href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
              onClick={() => handleLinkClick(`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`)}
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
            >
              {loadingPath === `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Workspace
            </Link>
            <Link 
              href="/dashboard" 
              onClick={() => handleLinkClick("/dashboard")}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
            >
              {loadingPath === "/dashboard" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Lobby
            </Link>
          </div>
        </details>
      </nav>

      <details className="relative sm:hidden">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition-all hover:border-slate-300 hover:bg-white hover:shadow-md">
          <MoreVertical className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 top-11 z-30 min-w-44 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
          <Link
            href={`/${tenantSlug}/audits`}
            onClick={() => handleLinkClick(auditsBase)}
            className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onAudits ? "bg-slate-900 text-white" : "text-slate-700")}
          >
            {loadingPath === auditsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Forms
          </Link>
          {caps.canSeeAdminRoutes ? (
            <Link
              href={correctiveActionsBase}
              onClick={() => handleLinkClick(correctiveActionsBase)}
              className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onCorrectiveActions ? "bg-slate-900 text-white" : "text-slate-700")}
            >
              {loadingPath === correctiveActionsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Corrective actions
            </Link>
          ) : null}
          {caps.canSeeAdminRoutes ? (
            <Link
              href={`/${tenantSlug}/activity`}
              onClick={() => handleLinkClick(activityBase)}
              className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onActivity ? "bg-slate-900 text-white" : "text-slate-700")}
            >
              {loadingPath === activityBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Activity
            </Link>
          ) : null}
          {caps.canCreateForms ? (
            <Link
              href={`/${tenantSlug}/templates`}
              onClick={() => handleLinkClick(`/${tenantSlug}/templates`)}
              className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onTemplates ? "bg-slate-900 text-white" : "text-slate-700")}
            >
              {loadingPath === `/${tenantSlug}/templates` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Templates
            </Link>
          ) : null}
          {caps.canSeeAdminRoutes ? (
            <>
              <Link
                href={settingsBase}
                onClick={() => handleLinkClick(settingsBase)}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onSettings ? "bg-slate-900 text-white" : "text-slate-700")}
              >
                {loadingPath === settingsBase ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Settings
              </Link>
              <Link
                href={`/${tenantSlug}/categories`}
                onClick={() => handleLinkClick(`/${tenantSlug}/categories`)}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-slate-100 " + (onCategories ? "bg-slate-900 text-white" : "text-slate-700")}
              >
                {loadingPath === `/${tenantSlug}/categories` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Categories
              </Link>
            </>
          ) : null}
          <Link
            href={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
            onClick={() => handleLinkClick(`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`)}
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
          >
            {loadingPath === `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Workspace
          </Link>
          <Link 
            href="/dashboard" 
            onClick={() => handleLinkClick("/dashboard")}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
          >
            {loadingPath === "/dashboard" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Lobby
          </Link>
        </div>
      </details>
    </>
  );
}
