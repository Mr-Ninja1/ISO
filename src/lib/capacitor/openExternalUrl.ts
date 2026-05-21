"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

const CAPACITOR_APP_HOSTS = new Set(["localhost", "127.0.0.1", ""]);

/**
 * True when the WebView left the bundled app origin (e.g. after opening an APK link in-page).
 */
export function isCapacitorWebViewStrayed(): boolean {
  if (typeof window === "undefined" || !isCapacitorNativeApp()) return false;
  const host = window.location.hostname.toLowerCase();
  return Boolean(host && !CAPACITOR_APP_HOSTS.has(host));
}

/** Return to bundled app root — fixes "This page could not load" after external navigation. */
export function recoverCapacitorWebViewIfStrayed(): boolean {
  if (!isCapacitorWebViewStrayed()) return false;
  const root = `${window.location.origin}/`;
  window.location.replace(root);
  return true;
}

/**
 * Open HTTPS links outside the main WebView (APK downloads, GitHub releases, etc.).
 * Never assign window.location to a non-HTML URL — that bricks the shell on next launch.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!target) return;

  if (isCapacitorNativeApp()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: target });
      return;
    } catch {
      // Plugin missing until cap sync — fall through
    }

    try {
      const anchor = document.createElement("a");
      anchor.href = target;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    } catch {
      // ignore
    }
  }

  window.open(target, "_blank", "noopener,noreferrer");
}
