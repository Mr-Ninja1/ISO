"use client";

import { useEffect } from "react";
import { hasPersistedAuthCredentials } from "@/lib/auth";
import { hardNavigateAbsolute, isAppRootPath, normalizeAppPathname } from "@/lib/client/appEntryNavigation";
import {
  forceNativeEntryExit,
  isNativeEntryShellPath,
  resolveNativeEntryDestination,
  runNativeEntryRedirectIfNeeded,
} from "@/lib/capacitor/nativeEntryNavigation";
import { wasOtaReloadRecent } from "@/lib/capacitor/liveUpdateReady";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { isNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";

const RECOVER_KEY = "iso-blank-recover-at:v1";
const MIN_RECOVER_GAP_MS = 8000;

function isNativeUpdateGateVisible() {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector('[data-iso-native-update-gate="true"]'));
}

function pageHasMainInteractiveContent() {
  if (typeof document === "undefined") return false;
  const root = document.getElementById("__next") ?? document.body;
  const otaBar = document.querySelector("[data-iso-ota-status-bar]");
  const candidates = root.querySelectorAll(
    "button:not([aria-label='Close dialog']), a[href], main h1, main h2, [role='dialog'], [data-workspace-shell]"
  );
  for (const node of candidates) {
    if (!otaBar?.contains(node)) return true;
  }
  return false;
}

function pageLooksBlank() {
  if (typeof document === "undefined") return false;
  if (pageHasMainInteractiveContent()) return false;
  const root = document.getElementById("__next") ?? document.body;
  const text = (root.textContent || "").replace(/\s+/g, " ").trim();
  return text.length <= 60;
}

function tryRecover(reason: string) {
  if (wasOtaReloadRecent(60_000)) return;
  if (isNativeUpdateBlocked() || isNativeUpdateGateVisible()) return;

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

  if (isNativeEntryShellPath()) {
    if (runNativeEntryRedirectIfNeeded()) return;
    console.warn(`[CapacitorAppRecovery] Stuck on / (${reason}); forcing entry exit`);
    forceNativeEntryExit();
    return;
  }

  if (!pageLooksBlank()) return;

  const path = normalizeAppPathname(window.location.pathname);
  if (!isAppRootPath(path)) return;

  const target = hasPersistedAuthCredentials() ? resolveNativeEntryDestination() : "/login";
  console.warn(`[CapacitorAppRecovery] Blank screen (${reason}); navigating to ${target}`);
  hardNavigateAbsolute(target);
}

/**
 * Safety net when the WebView resumes before React hydrates — does not fight OTA boot redirects.
 */
export function CapacitorAppRecovery() {
  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const scheduleCheck = (reason: string, delayMs: number) => {
      window.setTimeout(() => tryRecover(reason), delayMs);
    };

    scheduleCheck("mount-1", 3500);
    scheduleCheck("mount-2", 9000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleCheck("visibility", 2000);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) scheduleCheck("pageshow", 1500);
    });

    let removeAppListener: (() => void) | undefined;

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) scheduleCheck("resume", 2000);
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
