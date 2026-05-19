"use client";

import { useEffect } from "react";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolvePostAuthDestination,
} from "@/lib/client/appEntryNavigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

const RECOVER_KEY = "iso-blank-recover-at:v1";
const MIN_RECOVER_GAP_MS = 3000;

const STUCK_LOADING_PHRASES = [
  "taking you to your workspace",
  "starting iso pro",
  "loading workspace",
  "restoring your session",
  "opening workspace",
  "signing in",
  "restoring your brand",
];

function pageLooksBlank() {
  if (typeof document === "undefined") return false;
  const root = document.getElementById("__next") ?? document.body;
  const text = (root.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length > 80) return false;
  const interactive = root.querySelector(
    "button:not([aria-label='Close dialog']), a[href], main h1, main h2, [role='dialog']"
  );
  return !interactive;
}

function pageLooksStuckOnLoadingShell() {
  if (typeof document === "undefined") return false;
  const text = (document.body.textContent || "").toLowerCase();
  return STUCK_LOADING_PHRASES.some((phrase) => text.includes(phrase));
}

function shouldForceEntryNavigation() {
  const path = normalizeAppPathname(window.location.pathname);
  const search = window.location.search;
  if (isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search)) return true;
  return pageLooksStuckOnLoadingShell() && (isAppRootPath(path) || path === "/workspace");
}

function tryRecover(reason: string) {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RECOVER_KEY) || "0");
  } catch {
    // ignore
  }

  const now = Date.now();
  if (now - last < MIN_RECOVER_GAP_MS) return;

  try {
    sessionStorage.setItem(RECOVER_KEY, String(now));
  } catch {
    // ignore
  }

  if (shouldForceEntryNavigation()) {
    const target = hasPersistedAuthCredentials() ? resolvePostAuthDestination() : "/login";
    console.warn(`[CapacitorAppRecovery] Stuck entry (${reason}); navigating to ${target}`);
    hardNavigate(target);
    return;
  }

  if (!pageLooksBlank()) return;

  const target = hasPersistedAuthCredentials() ? resolvePostAuthDestination() : "/login";
  console.warn(`[CapacitorAppRecovery] Blank screen (${reason}); navigating to ${target}`);
  hardNavigate(target);
}

/**
 * After a force-close + quick reopen, the WebView can resume before React hydrates.
 * Navigates to workspace/login if the page stayed empty or on the loading shell too long.
 */
export function CapacitorAppRecovery() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const scheduleCheck = (reason: string, delayMs: number) => {
      window.setTimeout(() => tryRecover(reason), delayMs);
    };

    scheduleCheck("mount-1", 1200);
    scheduleCheck("mount-2", 2800);
    scheduleCheck("mount-3", 5000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleCheck("visibility-1", 400);
        scheduleCheck("visibility-2", 1800);
        scheduleCheck("visibility-3", 4000);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        scheduleCheck("pageshow-1", 300);
        scheduleCheck("pageshow-2", 1600);
        scheduleCheck("pageshow-3", 4200);
      }
    });

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            scheduleCheck("resume-1", 500);
            scheduleCheck("resume-2", 2200);
            scheduleCheck("resume-3", 4500);
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

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, []);

  return null;
}
