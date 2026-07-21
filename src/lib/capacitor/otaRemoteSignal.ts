"use client";

import { apiUrl } from "@/lib/client/apiBase";
import {
  readActivatedBundleId,
  resolveActiveBundleId,
} from "@/lib/capacitor/liveUpdateClient";
import { OTA_PUSH_EVENT } from "@/lib/capacitor/otaRealtime";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

type ClientConfig = {
  otaLatestBundleId?: string | null;
};

/**
 * Lightweight poll of the published bundle id (no zip download).
 * Used once on cold start before Realtime connects.
 */
export async function remoteOtaBundleDiffersFromActive(): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  try {
    const res = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
    if (!res.ok) return false;
    const config = (await res.json().catch(() => ({}))) as ClientConfig;
    const remote = (config.otaLatestBundleId || "").trim();
    if (!remote) return false;
    const active = resolveActiveBundleId(readActivatedBundleId());
    if (!active) return false;
    return active !== remote;
  } catch {
    return false;
  }
}

export function dispatchOtaPushIfNeeded(remoteBundleId: string) {
  window.dispatchEvent(
    new CustomEvent(OTA_PUSH_EVENT, { detail: { bundleId: remoteBundleId, at: Date.now() } })
  );
}
