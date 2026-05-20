"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/**
 * After OTA or full page loads, ensure the main Next CSS bundle is linked.
 * Prevents unstyled Suspense fallbacks on tenant routes.
 */
export function CapacitorStylesGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const ensureStylesheet = () => {
      const existing = document.querySelector('link[rel="stylesheet"][href*="/_next/static/css/"]');
      if (existing) return;

      const html = document.documentElement.innerHTML;
      const match = html.match(/href="(\/_next\/static\/css\/[^"]+\.css)"/);
      const href = match?.[1];
      if (!href) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-precedence", "next");
      document.head.appendChild(link);
    };

    ensureStylesheet();
    const t = window.setTimeout(ensureStylesheet, 50);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
