"use client";

import { useEffect } from "react";
import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolvePostAuthDestination,
} from "@/lib/client/appEntryNavigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

const RESUME_REDIRECT_DELAY_MS = 4000;

/**
 * Static Capacitor bundle: recover entry shells after resume only.
 * Do NOT hard-navigate on cold start — that races React boot and causes
 * "This page could not load" before login renders.
 */
export function CapacitorEntryRedirect() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let resumeTimer: number | undefined;

    function scheduleResumeRedirect() {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        const path = normalizeAppPathname(window.location.pathname);
        const search = window.location.search;
        if (isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search)) {
          hardNavigate(resolvePostAuthDestination());
        }
      }, RESUME_REDIRECT_DELAY_MS);
    }

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) scheduleResumeRedirect();
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
      if (document.visibilityState === "visible") scheduleResumeRedirect();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, []);

  return null;
}
