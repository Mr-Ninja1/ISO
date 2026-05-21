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
