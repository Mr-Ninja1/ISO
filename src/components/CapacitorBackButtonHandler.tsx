"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AppNavigationStack, buildAppPath, recordCapacitorNavigation } from "@/lib/capacitor/backButton";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/**
 * Keeps the sessionStorage navigation stack in sync with Next.js routes.
 * Hardware back is handled by /capacitor-hardware-back.js + MainActivity.
 */
export function CapacitorBackButtonHandler() {
  const pathname = usePathname() || "/";
  const stackRef = useRef(new AppNavigationStack());

  const readFullPath = useCallback(() => {
    if (typeof window === "undefined") return buildAppPath(pathname);
    return buildAppPath(pathname, window.location.search);
  }, [pathname]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    const fullPath = readFullPath();
    stackRef.current.record(fullPath);
    recordCapacitorNavigation(fullPath);
  }, [readFullPath]);

  return null;
}
