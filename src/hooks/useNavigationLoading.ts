"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Hook for managing loading state on navigation buttons.
 * Shows spinner while navigating, auto-clears after a short delay.
 */
export function useNavigationLoading() {
  const [navigationLoading, setNavigationLoading] = useState(false);
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      setNavigationLoading(true);
      router.push(href);
      // Auto-clear loading state after 500ms to handle rapid clicks
      setTimeout(() => setNavigationLoading(false), 500);
    },
    [router]
  );

  const goBack = useCallback(() => {
    setNavigationLoading(true);
    router.back();
    setTimeout(() => setNavigationLoading(false), 500);
  }, [router]);

  return { navigationLoading, navigate, goBack };
}
