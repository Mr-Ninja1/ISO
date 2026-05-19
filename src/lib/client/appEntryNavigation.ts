import { hasPersistedAuthCredentials } from "@/lib/auth";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

export function normalizeAppPathname(pathname: string) {
  const base = pathname.replace(/\/+$/, "") || "/";
  if (base.endsWith("/index.html")) {
    return base.slice(0, -"/index.html".length) || "/";
  }
  return base;
}

export function isAppRootPath(pathname: string) {
  const path = normalizeAppPathname(pathname);
  return path === "" || path === "/";
}

export function isWorkspaceEntryWithoutTenant(pathname: string, search: string) {
  const path = normalizeAppPathname(pathname);
  if (path !== "/workspace") return false;
  return !search.includes("tenantSlug=");
}

export function resolveAuthenticatedEntryPath(): string {
  return hasPersistedAuthCredentials() ? "/workspace" : "/login";
}

export function resolveWorkspaceUrlWithLastTenant(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const last = (localStorage.getItem("lastTenantSlug") || "").trim();
    if (!last || last === "workspace" || last === "_") return null;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(last)) return null;
    return `/workspace?tenantSlug=${encodeURIComponent(last)}`;
  } catch {
    return null;
  }
}

export function resolvePostAuthDestination(): string {
  return resolveWorkspaceUrlWithLastTenant() || resolveAuthenticatedEntryPath();
}

/** Reliable navigation after force-close / WebView resume (client router alone can stall). */
export function hardNavigate(href: string) {
  if (typeof window === "undefined") return;
  const path = href.startsWith("/") ? href : `/${href}`;
  if (isCapacitorNativeApp()) {
    window.location.replace(path);
    return;
  }
  window.location.assign(path);
}

export function navigateToPostAuthEntry(routerReplace: (href: string) => void) {
  const destination = resolvePostAuthDestination();
  routerReplace(destination);
  if (!isCapacitorNativeApp()) return;

  window.setTimeout(() => {
    const path = normalizeAppPathname(window.location.pathname);
    if (isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, window.location.search)) {
      hardNavigate(destination);
    }
  }, 1200);
}
