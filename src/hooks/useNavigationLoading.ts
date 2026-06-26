"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";

/**
 * Hook for managing loading state on navigation buttons.
 * Shows spinner while navigating until the route commits.
 */
export function useNavigationLoading() {
  const [navigationLoading, setNavigationLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setNavigationLoading(false);
  }, [pathname]);

  const navigate = useCallback(
    (href: string, method: "push" | "replace" = "push") => {
      setNavigationLoading(true);
      navigateWithFeedback(router, href, method);
    },
    [router],
  );

  const goBack = useCallback(() => {
    setNavigationLoading(true);
    router.back();
  }, [router]);

  return { navigationLoading, navigate, goBack };
}
