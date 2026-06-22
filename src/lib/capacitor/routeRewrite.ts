import { CAPACITOR_EXPORT_TENANT_SLUG } from "@/lib/capacitor/staticExport";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

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
  "shared",
  "email-verified",
  "forgot-password",
  "reset-password",
  "verify-email",
  "manifest.webmanifest",
]);

function isExternalHref(href: string) {
  return /^(https?:|mailto:|tel:|sms:|javascript:)/i.test(href);
}

/**
 * Static Capacitor export only ships HTML under `/_/…`. Real brand slugs in the path
 * (e.g. `/acme/audits`) 404 in the WebView — rewrite to `/_/audits?tenantSlug=acme`.
 */
export function rewriteCapacitorHref(href: string): string {
  if (!isCapacitorNativeApp() || typeof window === "undefined") return href;
  if (!href || href.startsWith("#") || isExternalHref(href)) return href;

  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return href;
  }

  if (url.origin !== window.location.origin) return href;

  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (!parts.length) return href;

  // `/workspace/forms` is a web-only redirect page — on native, stay on `/workspace?view=forms`.
  if (parts[0] === "workspace" && parts[1] === "forms") {
    const params = new URLSearchParams(url.search);
    if (!params.get("view")) params.set("view", "forms");
    const qs = params.toString();
    return qs ? `/workspace?${qs}` : "/workspace";
  }

  const first = parts[0];
  if (first === CAPACITOR_EXPORT_TENANT_SLUG || RESERVED_SEGMENTS.has(first)) {
    return href;
  }

  const tenantSlug = first;
  const rest = parts.slice(1).join("/");
  const params = new URLSearchParams(url.search);
  if (!params.get("tenantSlug")) {
    params.set("tenantSlug", tenantSlug);
  }

  const newPath = rest ? `/_/${rest}` : "/_/";
  const qs = params.toString();
  return qs ? `${newPath}?${qs}` : newPath;
}

export function rewriteCapacitorLocation(pathname: string, search = ""): string {
  const path = pathname || "/";
  const href = search ? `${path}${search.startsWith("?") ? search : `?${search}`}` : path;
  return rewriteCapacitorHref(href);
}
