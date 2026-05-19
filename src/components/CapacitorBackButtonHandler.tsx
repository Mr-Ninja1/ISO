"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initCapacitorBackButton, trackPageNavigation } from "@/lib/capacitor/backButton";

/**
 * Initialize Capacitor back button handling on mount.
 * Also tracks page navigation for the back button stack.
 */
export function CapacitorBackButtonHandler() {
  const pathname = usePathname();

  useEffect(() => {
    initCapacitorBackButton();
  }, []);

  useEffect(() => {
    if (pathname) {
      trackPageNavigation(pathname);
    }
  }, [pathname]);

  return null;
}
