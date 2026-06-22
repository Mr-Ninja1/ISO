"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rewriteCapacitorHref } from "@/lib/capacitor/routeRewrite";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/**
 * Rewrites programmatic router.push/replace on native (links are handled by CapacitorRouteRewrite).
 */
export function CapacitorRouterRewrite() {
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const routerRecord = router as {
      push: (href: string, options?: unknown) => void;
      replace: (href: string, options?: unknown) => void;
    };

    const originalPush = routerRecord.push.bind(router);
    const originalReplace = routerRecord.replace.bind(router);

    routerRecord.push = (href: string, options?: unknown) => {
      originalPush(rewriteCapacitorHref(href), options);
    };

    routerRecord.replace = (href: string, options?: unknown) => {
      originalReplace(rewriteCapacitorHref(href), options);
    };

    return () => {
      routerRecord.push = originalPush;
      routerRecord.replace = originalReplace;
    };
  }, [router]);

  return null;
}
