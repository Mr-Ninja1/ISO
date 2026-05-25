"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { readAppliedBundleId, OTA_BUNDLE_STORAGE_KEY } from "@/lib/capacitor/liveUpdateClient";
import { isNativeEntryShellPath } from "@/lib/capacitor/nativeEntryNavigation";
import { wasOtaReloadRecent } from "@/lib/capacitor/liveUpdateReady";

const STUCK_MARK = "iso-ota-stuck-since:v1";
const STUCK_MIN_MS = 45_000;

/**
 * Last-resort rollback when the WebView is truly blank on `/` after an OTA apply.
 * Does not react to intentional loading shells ("Starting ISO Pro", etc.) — those
 * were causing reload loops with entry redirect + recovery.
 */
export function OtaBundleRecovery() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    if (!readAppliedBundleId()) return;

    const tick = window.setInterval(() => {
      if (wasOtaReloadRecent(180_000)) return;

      if (!isNativeEntryShellPath()) {
        try {
          sessionStorage.removeItem(STUCK_MARK);
        } catch {
          // ignore
        }
        return;
      }

      const text = (document.body.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length > 60) {
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

      if (Date.now() - since < STUCK_MIN_MS) return;

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
    }, 3000);

    return () => window.clearInterval(tick);
  }, []);

  return null;
}
