"use client";

import {
  hardNavigate,
  isAppRootPath,
  isWorkspaceEntryWithoutTenant,
  normalizeAppPathname,
  resolvePostAuthDestination,
  resolveQuickEntryDestination,
} from "@/lib/client/appEntryNavigation";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { wasOtaReloadRecent } from "@/lib/capacitor/liveUpdateReady";
import { isNativeUpdateRequiredFromCache } from "@/lib/capacitor/platformClientConfig";
import { isNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

const REDIRECT_TS_KEY = "iso-native-hard-nav-at:v1";
const REDIRECT_MIN_GAP_MS = 6000;

let redirectInFlight = false;

export function isNativeEntryShellPath(): boolean {
  if (typeof window === "undefined") return false;
  const path = normalizeAppPathname(window.location.pathname);
  const search = window.location.search;
  return isAppRootPath(path) || isWorkspaceEntryWithoutTenant(path, search);
}

export function canRunNativeEntryRedirect(): boolean {
  if (!isCapacitorNativeApp()) return false;
  if (isNativeUpdateBlocked()) return false;
  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) return false;
  return isNativeEntryShellPath();
}

export function resolveNativeEntryDestination(): string {
  return resolveQuickEntryDestination() || resolvePostAuthDestination();
}

export function clearNativeRedirectThrottle() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REDIRECT_TS_KEY);
  } catch {
    // ignore
  }
}

function recentRedirectBlocked(): boolean {
  if (wasOtaReloadRecent(120_000)) return false;
  try {
    const last = Number(sessionStorage.getItem(REDIRECT_TS_KEY) || "0");
    return Date.now() - last < REDIRECT_MIN_GAP_MS;
  } catch {
    return false;
  }
}

function markRedirectAttempt() {
  try {
    sessionStorage.setItem(REDIRECT_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * One coordinated redirect from `/` or bare `/workspace`.
 * Persists throttle in sessionStorage so OTA full reloads do not loop.
 */
export function runNativeEntryRedirectIfNeeded(): boolean {
  if (!canRunNativeEntryRedirect()) return false;
  if (redirectInFlight || recentRedirectBlocked()) return false;

  const dest = resolveNativeEntryDestination();
  redirectInFlight = true;
  markRedirectAttempt();
  hardNavigate(dest);

  window.setTimeout(() => {
    redirectInFlight = false;
  }, 3000);

  return true;
}
