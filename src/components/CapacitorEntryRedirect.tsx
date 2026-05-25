"use client";

import { useEffect } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  canRunNativeEntryRedirect,
  runNativeEntryRedirectIfNeeded,
} from "@/lib/capacitor/nativeEntryNavigation";

/** Resume-only safety net — primary redirect runs in CapacitorBootstrap before paint. */
export function CapacitorEntryRedirect() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const tryRedirect = () => {
      if (!canRunNativeEntryRedirect()) return;
      runNativeEntryRedirectIfNeeded();
    };

    let resumeTimer: number | undefined;

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            window.clearTimeout(resumeTimer);
            resumeTimer = window.setTimeout(tryRedirect, 400);
          }
        })
      )
      .then((handle) => {
        removeAppListener = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        // plugin unavailable
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(tryRedirect, 400);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(tryRedirect, 400);
      }
    });

    const mountDelays = [0, 350, 1100, 2400];
    const mountTimers = mountDelays.map((delay) => window.setTimeout(tryRedirect, delay));

    return () => {
      mountTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, []);

  return null;
}
