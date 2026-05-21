"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { readAppliedBundleId, OTA_BUNDLE_STORAGE_KEY } from "@/lib/capacitor/liveUpdateClient";
import { isNativeEntryShellPath } from "@/lib/capacitor/nativeEntryNavigation";
import { wasOtaReloadRecent } from "@/lib/capacitor/liveUpdateReady";

const STUCK_MARK = "iso-ota-stuck-since:v1";

/**
 * If an OTA bundle leaves the app on the loading shell too long, roll back to the APK default bundle.
 */
export function OtaBundleRecovery() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    if (!readAppliedBundleId()) return;

    const tick = window.setInterval(() => {
      if (!isNativeEntryShellPath() && !wasOtaReloadRecent(120_000)) {
        try {
          sessionStorage.removeItem(STUCK_MARK);
        } catch {
          // ignore
        }
        return;
      }

      const text = (document.body.textContent || "").toLowerCase();
      const looksStuck =
        text.includes("preparing the app") ||
        text.includes("starting iso pro") ||
        text.includes("loading workspace") ||
        text.includes("signing in");

      if (!looksStuck) {
        try {
          sessionStorage.removeItem(STUCK_MARK);
        } catch {
          // ignore
        }
        return;
      }

      let since = 0;
      try {
        since = Number(sessionStorage.getItem(STUCK_MARK) || "0");
        if (!since) {
          sessionStorage.setItem(STUCK_MARK, String(Date.now()));
          return;
        }
      } catch {
        return;
      }

      if (Date.now() - since < 18_000) return;

      void (async () => {
        try {
          const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
          await LiveUpdate.reset();
          try {
            localStorage.removeItem(OTA_BUNDLE_STORAGE_KEY);
          } catch {
            // ignore
          }
          try {
            sessionStorage.removeItem(STUCK_MARK);
          } catch {
            // ignore
          }
          await LiveUpdate.reload();
        } catch {
          // ignore
        }
      })();
    }, 2000);

    return () => window.clearInterval(tick);
  }, []);

  return null;
}
