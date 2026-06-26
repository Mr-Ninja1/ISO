/** Canonical workspace URLs — avoid /workspace/forms redirect hop (breaks Capacitor static export). */

export type WorkspaceSurfaceView = "forms" | "admin";

const VIEW_PREF_KEY = "workspace-last-view:v1";

export function rememberWorkspaceViewPref(view: WorkspaceSurfaceView) {
  try {
    sessionStorage.setItem(VIEW_PREF_KEY, view);
  } catch {
    // ignore
  }
}

export function readWorkspaceViewPref(): WorkspaceSurfaceView | null {
  try {
    const value = sessionStorage.getItem(VIEW_PREF_KEY);
    if (value === "forms" || value === "admin") return value;
  } catch {
    // ignore
  }
  return null;
}

/** Read the view currently in the browser URL (safe inside async callbacks). */
export function resolveWorkspaceViewFromLocation(): WorkspaceSurfaceView | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("view");
  if (value === "forms" || value === "admin") return value;
  return null;
}

/** Keep the live URL view when syncing query params after async workspace loads. */
export function preserveWorkspaceViewInParams(
  next: URLSearchParams,
  fallback: WorkspaceSurfaceView = "admin",
) {
  const live = resolveWorkspaceViewFromLocation();
  if (live) {
    next.set("view", live);
    return;
  }
  const existing = next.get("view");
  if (existing === "forms" || existing === "admin") return;
  next.set("view", fallback);
}

export function buildWorkspaceFormsHref(tenantSlug: string) {
  const slug = (tenantSlug || "").trim();
  if (!slug) return "/workspace";
  return `/workspace?tenantSlug=${encodeURIComponent(slug)}&view=forms`;
}

export function buildWorkspaceAdminHref(tenantSlug: string) {
  const slug = (tenantSlug || "").trim();
  if (!slug) return "/workspace";
  return `/workspace?tenantSlug=${encodeURIComponent(slug)}&view=admin`;
}

export function buildWorkspaceEntryHref(
  tenantSlug: string,
  options?: { view?: WorkspaceSurfaceView | null; categoryId?: string | null },
) {
  const slug = (tenantSlug || "").trim();
  if (!slug) return "/workspace";
  const next = new URLSearchParams();
  next.set("tenantSlug", slug);
  const view = options?.view ?? readWorkspaceViewPref();
  if (view === "forms") next.set("view", "forms");
  else if (view === "admin") next.set("view", "admin");
  if (options?.categoryId) next.set("categoryId", options.categoryId);
  return `/workspace?${next.toString()}`;
}
