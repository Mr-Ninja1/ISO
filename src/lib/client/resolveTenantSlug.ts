"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { CAPACITOR_EXPORT_TENANT_SLUG } from "@/lib/capacitor/staticExport";
import { readWorkspaceCacheResolved } from "@/lib/client/workspaceCache";

const RESERVED_SEGMENTS = new Set([
  "workspace",
  "dashboard",
  "login",
  "signup",
  "developer-login",
  "onboarding",
  "offline",
  "admin",
  "_",
  "api",
]);

export function normalizeTenantSlug(value: string | null | undefined): string {
  const slug = (value || "").trim();
  if (!slug || slug === CAPACITOR_EXPORT_TENANT_SLUG || slug === "workspace") return "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return "";
  return slug;
}

export function tenantSlugFromPathname(pathname: string | null | undefined): string {
  if (!pathname) return "";
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  if (RESERVED_SEGMENTS.has(first)) return "";
  return normalizeTenantSlug(first);
}

export type ResolveTenantSlugOptions = {
  routeParam?: string | null;
  pathname?: string | null;
  querySlug?: string | null;
};

/**
 * Resolves the active brand slug for API calls and cache keys.
 * On Capacitor, static export uses `_` in route params; the real slug comes from the URL path.
 */
export function resolveTenantSlug(options: ResolveTenantSlugOptions = {}): string {
  const fromPath = tenantSlugFromPathname(
    options.pathname ?? (typeof window !== "undefined" ? window.location.pathname : null)
  );
  if (fromPath) return fromPath;

  const fromQuery = normalizeTenantSlug(options.querySlug);
  if (fromQuery) return fromQuery;

  const fromParam = normalizeTenantSlug(options.routeParam);
  if (fromParam) return fromParam;

  if (typeof window !== "undefined") {
    const last = normalizeTenantSlug(localStorage.getItem("lastTenantSlug"));
    if (last) return last;
  }

  return "";
}

export function rememberActiveTenantSlug(slug: string) {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized || typeof window === "undefined") return;
  try {
    localStorage.setItem("lastTenantSlug", normalized);
  } catch {
    // ignore
  }
}

export function readTenantMetaFromWorkspaceCache(userId: string | null, tenantSlug: string) {
  const slug = normalizeTenantSlug(tenantSlug);
  if (!slug) return null;
  const workspace = readWorkspaceCacheResolved(userId, slug, null);
  if (!workspace?.tenant?.id) return null;
  return workspace.tenant;
}

export function useResolvedTenantSlug(routeParam?: string | null): string {
  const pathname = usePathname();

  const slug = useMemo(() => {
    let querySlug: string | null = null;
    if (typeof window !== "undefined") {
      querySlug = new URLSearchParams(window.location.search).get("tenantSlug");
    }
    return resolveTenantSlug({ routeParam, pathname, querySlug });
  }, [routeParam, pathname]);

  useEffect(() => {
    if (slug) rememberActiveTenantSlug(slug);
  }, [slug]);

  return slug;
}
