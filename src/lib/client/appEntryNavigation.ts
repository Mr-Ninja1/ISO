import {
  hasPersistedAuthCredentials,
  readCachedAuthUser,
  readPersistedSupabaseSession,
} from "@/lib/auth";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { readPlatformDeveloperFlag } from "@/lib/client/platformDeveloperFlag";
import { resolvePostLoginRoute } from "@/lib/client/postLoginRouting";

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
  if (readPlatformDeveloperFlag()) return "/admin";
  return resolveWorkspaceUrlWithLastTenant() || resolveAuthenticatedEntryPath();
}

/** Async entry routing — checks platform developer before workspace/onboarding. */
export async function resolvePostAuthDestinationAsync(): Promise<string> {
  const persisted = readPersistedSupabaseSession();
  const token = persisted?.access_token || "";
  const cached = readCachedAuthUser();
  const email = cached?.email || persisted?.user?.email || "";
  const userId = cached?.id || persisted?.user?.id || null;

  if (token) {
    const route = await resolvePostLoginRoute(token, email, userId);
    return route.path;
  }

  return resolvePostAuthDestination();
}

/** Capacitor static export uses trailingSlash — normalize paths so WebView loads the right HTML. */
export function normalizeCapacitorHref(href: string): string {
  if (!isCapacitorNativeApp()) return href;
  const hashIdx = href.indexOf("#");
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const queryIdx = withoutHash.indexOf("?");
  const query = queryIdx >= 0 ? withoutHash.slice(queryIdx) : "";
  let path = queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path !== "/" && !path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) {
    path = `${path}/`;
  }
  return `${path}${query}${hash}`;
}

/** Reliable navigation after force-close / WebView resume (client router alone can stall). */
export function hardNavigate(href: string) {
  if (typeof window === "undefined") return;
  const path = normalizeCapacitorHref(href.startsWith("/") ? href : `/${href}`);
  const current = `${window.location.pathname}${window.location.search}`;
  const target = path.startsWith("/") ? path : `/${path}`;
  try {
    const base = window.location.origin;
    const a = new URL(current, base);
    const b = new URL(target, base);
    const norm = (p: string) => {
      const n = p.replace(/\/+$/, "") || "/";
      return n.endsWith("/index.html") ? n.slice(0, -"/index.html".length) || "/" : n;
    };
    if (norm(a.pathname) === norm(b.pathname) && a.search === b.search) {
      return;
    }
  } catch {
    // continue with navigation
  }
  if (isCapacitorNativeApp()) {
    const absolute = new URL(target, window.location.origin).href;
    window.location.replace(absolute);
    return;
  }
  window.location.assign(target);
}

/** Full-page navigation using an absolute URL (most reliable in the Android WebView). */
export function hardNavigateAbsolute(href: string) {
  if (typeof window === "undefined") return;
  const path = normalizeCapacitorHref(href.startsWith("/") ? href : `/${href}`);
  const absolute = new URL(path.startsWith("/") ? path : `/${path}`, window.location.origin).href;
  window.location.replace(absolute);
}

/** Immediate sync destination when credentials / last tenant are already known. */
export function resolveQuickEntryDestination(): string | null {
  if (typeof window === "undefined") return null;
  if (!hasPersistedAuthCredentials()) return "/login";
  if (readPlatformDeveloperFlag()) return "/admin";
  return resolveWorkspaceUrlWithLastTenant() || "/workspace";
}

export function navigateToPostAuthEntry(routerReplace: (href: string) => void) {
  if (isCapacitorNativeApp()) {
    return;
  }

  const quick = resolveQuickEntryDestination();
  if (quick) {
    routerReplace(quick);
    return;
  }

  void resolvePostAuthDestinationAsync().then((destination) => {
    routerReplace(destination);
  });
}
