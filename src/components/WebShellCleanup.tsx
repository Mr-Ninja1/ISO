"use client";

import { useLayoutEffect } from "react";
import {
  runWebStorageHygieneAsync,
  runWebStorageHygieneSync,
} from "@/lib/client/webStorageHygiene";

/**
 * Web-only bootstrap: purge stale localStorage + PWA caches after deploy.
 * Skipped entirely inside the native Capacitor shell.
 */
export function WebShellCleanup() {
  useLayoutEffect(() => {
    const result = runWebStorageHygieneSync();
    void runWebStorageHygieneAsync(result);
  }, []);

  return null;
}
