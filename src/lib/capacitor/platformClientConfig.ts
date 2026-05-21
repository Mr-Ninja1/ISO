"use client";

import { apiUrl } from "@/lib/client/apiBase";

export type PlatformClientConfig = {
  minNativeBuild?: number | null;
  latestApkUrl?: string | null;
  liveUpdateChannel?: string | null;
  liveUpdateBundleUrl?: string | null;
};

const CACHE_KEY = "iso-platform-client-config:v1";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedConfig = PlatformClientConfig & { fetchedAt: number };

export function readCachedPlatformClientConfig(): PlatformClientConfig | null {
  return readCache();
}

function readCache(): CachedConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedConfig;
    if (!parsed || typeof parsed.fetchedAt !== "number") return null;
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(config: PlatformClientConfig) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedConfig = { ...config, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function normalizeConfig(json: Record<string, unknown>): PlatformClientConfig {
  const min = json.minNativeBuild;
  const apk = json.latestApkUrl;
  return {
    minNativeBuild: typeof min === "number" && Number.isFinite(min) ? min : null,
    latestApkUrl: typeof apk === "string" && apk.trim() ? apk.trim() : null,
    liveUpdateChannel:
      typeof json.liveUpdateChannel === "string" ? json.liveUpdateChannel : null,
    liveUpdateBundleUrl:
      typeof json.liveUpdateBundleUrl === "string" ? json.liveUpdateBundleUrl : null,
  };
}

/** Fetch platform client-config; falls back to last good cache when offline. */
export async function fetchPlatformClientConfig(): Promise<{
  config: PlatformClientConfig;
  fromCache: boolean;
  fetchFailed: boolean;
}> {
  const cached = readCache();

  try {
    const res = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (cached) return { config: cached, fromCache: true, fetchFailed: true };
      return { config: {}, fromCache: false, fetchFailed: true };
    }
    const config = normalizeConfig(json);
    writeCache(config);
    return { config, fromCache: false, fetchFailed: false };
  } catch {
    if (cached) return { config: cached, fromCache: true, fetchFailed: true };
    return { config: {}, fromCache: false, fetchFailed: true };
  }
}

export function clearPlatformClientConfigCache() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export function shouldBlockForNativeUpdate(
  currentBuild: number,
  minNativeBuild: number | null | undefined
): boolean {
  if (minNativeBuild == null || !Number.isFinite(minNativeBuild)) return false;
  if (!Number.isFinite(currentBuild)) return false;
  return currentBuild < minNativeBuild;
}

/** Sync check from cached policy (used before entry redirects). */
export function isNativeUpdateRequiredFromCache(currentBuild: number): boolean {
  const cached = readCache();
  if (!cached) return false;
  return shouldBlockForNativeUpdate(currentBuild, cached.minNativeBuild);
}
