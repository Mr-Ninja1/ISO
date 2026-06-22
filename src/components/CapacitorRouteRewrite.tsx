"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rewriteCapacitorHref } from "@/lib/capacitor/routeRewrite";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/**
 * Rewrites tenant-scoped link clicks to `/_/…?tenantSlug=` (static export paths).
 * Full-page navigations are handled by MainActivity asset remapping + hardNavigate rewrite.
 */
export function CapacitorRouteRewrite() {
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        return;
      }

      const nextHref = rewriteCapacitorHref(rawHref);
      if (nextHref === rawHref) return;

      event.preventDefault();
      event.stopPropagation();
      router.push(nextHref);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
