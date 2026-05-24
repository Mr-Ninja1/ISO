"use client";

import { ISO_MOBILE_SHELL_LS_KEY, LAST_AUTH_USER_KEY } from "@/lib/auth";
import { clearStaleCapacitorShellMarkerIfWeb, isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  MOBILE_APP_BANNER_DISMISS_KEY,
  WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY,
} from "@/lib/client/mobileAndroidWeb";

/** Bumped in CI (`web.<run>`) so returning browsers drop stale caches after each deploy. */
export const WEB_STORAGE_SCHEMA_KEY = "iso-web-storage-schema:v1";

export const WEB_STORAGE_VERSION =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WEB_STORAGE_VERSION?.trim()) ||
  "0.1.0";

const SESSION_SW_RELOAD_KEY = "iso-web-sw-reload-done:v1";

/** Data caches safe to drop on deploy (auth + small prefs are preserved). */
const VERSION_BUMP_PURGE_PREFIXES = [
  "workspace-cache:v2:",
  "audits-list-cache:v1:",
  "audit-template-cache:v1:",
  "audit-local-draft:v1:",
  "activity-cache:v2:",
  "audit-report-snapshot:v1:",
  "audit-report-last:v1:",
  "template-library-cache:v2:",
  "offline-full-bootstrap:v1:",
  "iso-platform-client-config:v1",
  "iso-blank-recover-at:v1",
  "iso-ota-stuck-since:v1",
  "iso-ota-reload-at:v1",
  "iso-ota-bundle-applied:v1",
  "iso-native-hard-nav-at:v1",
  "audit-template-revalidate-cooldown:v1:",
  "library-cache:",
] as const;

/** Pruned when `ts` in JSON envelope is older than this (every visit, web only). */
const STALE_ENVELOPE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const STALE_ENVELOPE_PREFIXES = [...VERSION_BUMP_PURGE_PREFIXES] as const;

const PRESERVE_EXACT_KEYS = new Set([
  WEB_STORAGE_SCHEMA_KEY,
  LAST_AUTH_USER_KEY,
  ISO_MOBILE_SHELL_LS_KEY,
  "lastTenantSlug",
  "iso-theme-v1",
  "iso-platform-developer:v1",
  MOBILE_APP_BANNER_DISMISS_KEY,
  WORKSPACE_ANDROID_APP_CARD_DISMISS_KEY,
  "iso-msg-sound-unlocked:v1",
  "background-mutation-queue:v1",
  "audit-sync-queue:v1",
  "audit-offline-submitted:v1",
  "template-sync-queue:v1",
  "offlineModeEnabled",
  "offlinePreparedAt",
  "active-staff-profile:v1",
]);

const PRESERVE_PREFIXES = [
  "sb-",
  "iso-msg-acked:v1:",
  "iso-msg-toast-shown:v1:",
  "iso-tenant-deactivated:v1:",
  "iso-tenant-deactivated-reason:v1:",
  "iso-native-build-dismissed:v1:",
  "workspace-notice:v1:",
] as const;

const MAX_WORKSPACE_CACHE_KEYS = 24;

export type WebStorageHygieneResult = {
  skipped: boolean;
  versionChanged: boolean;
  removedKeys: number;
};

function shouldPreserveKey(key: string): boolean {
  if (PRESERVE_EXACT_KEYS.has(key)) return true;
  if (key.endsWith("-auth-token") && key.startsWith("sb-")) return true;
  return PRESERVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function removeKeysMatching(prefixes: readonly string[]): number {
  if (typeof window === "undefined") return 0;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || shouldPreserveKey(key)) continue;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return toRemove.length;
}

function readEnvelopeTimestamp(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { ts?: unknown };
    if (typeof parsed.ts === "number" && Number.isFinite(parsed.ts)) return parsed.ts;
  } catch {
    // ignore
  }
  return null;
}

function pruneStaleEnvelopeCaches(): number {
  if (typeof window === "undefined") return 0;
  const cutoff = Date.now() - STALE_ENVELOPE_MAX_AGE_MS;
  const toRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || shouldPreserveKey(key)) continue;
    if (!STALE_ENVELOPE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const ts = readEnvelopeTimestamp(raw);
    if (ts !== null && ts < cutoff) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return toRemove.length;
}

function capWorkspaceCaches(): number {
  if (typeof window === "undefined") return 0;
  const entries: { key: string; ts: number }[] = [];

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith("workspace-cache:v2:")) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const ts = readEnvelopeTimestamp(raw) ?? 0;
    entries.push({ key, ts });
  }

  if (entries.length <= MAX_WORKSPACE_CACHE_KEYS) return 0;

  entries.sort((a, b) => a.ts - b.ts);
  const overflow = entries.length - MAX_WORKSPACE_CACHE_KEYS;
  let removed = 0;
  for (let i = 0; i < overflow; i += 1) {
    try {
      localStorage.removeItem(entries[i].key);
      removed += 1;
    } catch {
      // ignore
    }
  }
  return removed;
}

/**
 * Runs synchronously on the public website before UI paints.
 * Never runs in the Capacitor APK (offline drafts, OTA markers, shell auth stay intact).
 */
export function runWebStorageHygieneSync(): WebStorageHygieneResult {
  if (typeof window === "undefined") {
    return { skipped: true, versionChanged: false, removedKeys: 0 };
  }
  if (isCapacitorNativeApp()) {
    return { skipped: true, versionChanged: false, removedKeys: 0 };
  }

  clearStaleCapacitorShellMarkerIfWeb();

  const previous = localStorage.getItem(WEB_STORAGE_SCHEMA_KEY);
  const versionChanged = previous !== WEB_STORAGE_VERSION;

  let removedKeys = 0;
  if (versionChanged) {
    removedKeys += removeKeysMatching(VERSION_BUMP_PURGE_PREFIXES);
    try {
      localStorage.removeItem(ISO_MOBILE_SHELL_LS_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(WEB_STORAGE_SCHEMA_KEY, WEB_STORAGE_VERSION);
    } catch {
      // ignore
    }
  }

  removedKeys += pruneStaleEnvelopeCaches();
  removedKeys += capWorkspaceCaches();

  return { skipped: false, versionChanged, removedKeys };
}

/** Unregister stale PWA workers after a deploy (web only). Reloads at most once per tab per version. */
export async function runWebStorageHygieneAsync(result: WebStorageHygieneResult): Promise<void> {
  if (result.skipped || !result.versionChanged) return;
  if (typeof window === "undefined") return;

  const reloadGuard = `${SESSION_SW_RELOAD_KEY}:${WEB_STORAGE_VERSION}`;
  try {
    if (sessionStorage.getItem(reloadGuard) === "1") return;
  } catch {
    // ignore
  }

  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0 && !("caches" in window)) return;

    for (const registration of registrations) {
      await registration.unregister();
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }

    try {
      sessionStorage.setItem(reloadGuard, "1");
    } catch {
      // ignore
    }

    window.location.reload();
  } catch {
    // ignore — stale SW is annoying but not fatal
  }
}
