"use client";

import { hasPersistedAuthCredentials } from "@/lib/auth";
import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolvePostAuthDestination,
} from "@/lib/client/appEntryNavigation";
import { isWithinOtaBootGracePeriod } from "@/lib/capacitor/otaBoot";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { shouldDeferNativeRecovery } from "@/lib/client/nativeStartupGate";
import { useEffect } from "react";

const RECOVER_KEY = "iso-blank-recover-at:v1";
const RECOVER_COUNT_KEY = "iso-blank-recover-count:v1";
const MIN_RECOVER_GAP_MS = 8000;
const MAX_RECOVERIES_PER_SESSION = 1;

/** Only treat as stuck when the UI is truly frozen — never normal post-auth / OTA boot copy. */
const STUCK_LOADING_PHRASES = [
  "restoring your session",
  "signing in",
  "restoring your brand",
];

/** Legitimate first-run / OTA boot UI — never treat as a freeze. */
const ACTIVE_BOOTSTRAP_PHRASES = [
  "preparing your brand",
  "starting download",
  "categories and form cards",
  "form schemas are cached",
  "starting iso grid",
  "taking you to your workspace",
  "opening workspace",
  "loading workspace",
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
  if (ACTIVE_BOOTSTRAP_PHRASES.some((phrase) => text.includes(phrase))) return false;
  return STUCK_LOADING_PHRASES.some((phrase) => text.includes(phrase));
}

function pageLooksLikeActiveBootstrap() {
  if (typeof document === "undefined") return false;
  const text = (document.body.textContent || "").toLowerCase();
  return ACTIVE_BOOTSTRAP_PHRASES.some((phrase) => text.includes(phrase));
}

function isEntryShellPath(path: string, search: string) {
  if (isAppRootPath(path)) return true;
  if (isWorkspaceEntryWithoutTenant(path, search)) return true;
  if (path === "/login") return true;
  return false;
}

function shouldForceEntryNavigation() {
  const path = normalizeAppPathname(window.location.pathname);
  const search = window.location.search;
  const onEntry = isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search);
  if (!onEntry) return false;
  return pageLooksBlank() || pageLooksStuckOnLoadingShell();
}

function recoveryCount(): number {
  try {
    return Number(sessionStorage.getItem(RECOVER_COUNT_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

function bumpRecoveryCount() {
  try {
    sessionStorage.setItem(RECOVER_COUNT_KEY, String(recoveryCount() + 1));
  } catch {
    // ignore
  }
}

function tryRecover(reason: string) {
  if (isWithinOtaBootGracePeriod()) return;
  if (shouldDeferNativeRecovery()) return;
  if (pageLooksLikeActiveBootstrap()) return;

  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RECOVER_KEY) || "0");
  } catch {
    // ignore
  }

  const now = Date.now();
  if (now - last < MIN_RECOVER_GAP_MS) return;
  if (recoveryCount() >= MAX_RECOVERIES_PER_SESSION) return;

  const path = normalizeAppPathname(window.location.pathname);
  const search = window.location.search;

  if (shouldForceEntryNavigation()) {
    try {
      sessionStorage.setItem(RECOVER_KEY, String(now));
    } catch {
      // ignore
    }
    bumpRecoveryCount();
    const target = hasPersistedAuthCredentials() ? resolvePostAuthDestination() : "/login";
    console.warn(`[CapacitorAppRecovery] Stuck entry (${reason}); navigating to ${target}`);
    hardNavigate(target);
    return;
  }

  if (!isEntryShellPath(path, search)) return;
  if (!pageLooksBlank()) return;

  try {
    sessionStorage.setItem(RECOVER_KEY, String(now));
  } catch {
    // ignore
  }
  bumpRecoveryCount();

  const target = hasPersistedAuthCredentials() ? resolvePostAuthDestination() : "/login";
  console.warn(`[CapacitorAppRecovery] Blank entry shell (${reason}); navigating to ${target}`);
  hardNavigate(target);
}

/**
 * Recovery for cold start / resume on entry shells only.
 * Skips OTA boot grace and normal "Starting ISO Grid" / workspace routing shells.
 */
export function CapacitorAppRecovery() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const scheduleCheck = (reason: string, delayMs: number) => {
      window.setTimeout(() => tryRecover(reason), delayMs);
    };

    scheduleCheck("mount-1", 6000);
    scheduleCheck("mount-2", 12000);
    scheduleCheck("mount-3", 20000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleCheck("visibility-1", 2000);
        scheduleCheck("visibility-2", 8000);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        scheduleCheck("pageshow-1", 2000);
        scheduleCheck("pageshow-2", 8000);
      }
    });

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            scheduleCheck("resume-1", 2500);
            scheduleCheck("resume-2", 10000);
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
