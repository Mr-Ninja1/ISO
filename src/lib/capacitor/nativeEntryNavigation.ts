"use client";

import {
  hardNavigate,
  isAppRootPath,
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
let bootRedirectDone = false;

/** Only `/` — bare `/workspace` has its own tenant picker and must not re-trigger entry redirects. */
export function isNativeEntryShellPath(): boolean {
  if (typeof window === "undefined") return false;
  return isAppRootPath(normalizeAppPathname(window.location.pathname));
}

export function canRunNativeEntryRedirect(): boolean {
  if (!isCapacitorNativeApp()) return false;
  if (bootRedirectDone) return false;
  if (isNativeUpdateBlocked()) return false;
  if (isNativeUpdateRequiredFromCache(parseNativeBuild())) return false;
  return isNativeEntryShellPath();
}

export function resolveNativeEntryDestination(): string {
  return resolveQuickEntryDestination() || resolvePostAuthDestination();
}

export function clearNativeRedirectThrottle() {
  if (typeof window === "undefined") return;
  bootRedirectDone = false;
  redirectInFlight = false;
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

function hrefsMatch(current: string, target: string): boolean {
  try {
    const base = window.location.origin;
    const a = new URL(current, base);
    const b = new URL(target, base);
    const pathA = normalizeAppPathname(a.pathname);
    const pathB = normalizeAppPathname(b.pathname);
    return pathA === pathB && a.search === b.search;
  } catch {
    return false;
  }
}

/**
 * One coordinated redirect from `/` after OTA or cold start.
 * Never re-navigate to the same URL (prevents reload flicker on `/workspace/`).
 */
export function runNativeEntryRedirectIfNeeded(): boolean {
  if (!canRunNativeEntryRedirect()) return false;
  if (redirectInFlight || recentRedirectBlocked()) return false;

  const dest = resolveNativeEntryDestination();
  const current = `${window.location.pathname}${window.location.search}`;
  if (hrefsMatch(current, dest)) {
    bootRedirectDone = true;
    return false;
  }

  redirectInFlight = true;
  bootRedirectDone = true;
  markRedirectAttempt();
  hardNavigate(dest);

  window.setTimeout(() => {
    redirectInFlight = false;
  }, 3000);

  return true;
}
