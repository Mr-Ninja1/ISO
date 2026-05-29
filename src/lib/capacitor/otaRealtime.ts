"use client";

import { createClient, hasPersistedAuthCredentials } from "@/lib/auth";
import { ISO_AUTH_READY_EVENT } from "@/lib/capacitor/otaEvents";
import { readActivatedBundleId } from "@/lib/capacitor/liveUpdateClient";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { isAppOffline } from "@/lib/client/appOffline";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const OTA_PUSH_EVENT = "iso-ota-push";

let subscribeGeneration = 0;

function dispatchOtaPush(bundleId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OTA_PUSH_EVENT, { detail: { bundleId, at: Date.now() } })
  );
}

/**
 * Subscribe to platform_settings changes (Supabase Realtime).
 * When `ota_latest_bundle_id` changes and differs from the active bundle, notifies the app once.
 */
export function subscribeToOtaRealtime(onPush: () => void): () => void {
  if (!isCapacitorNativeApp()) return () => undefined;

  const generation = ++subscribeGeneration;
  let channel: RealtimeChannel | null = null;
  let debounceTimer: number | null = null;

  const scheduleCheck = (remoteBundleId: string | null | undefined) => {
    if (!remoteBundleId || isAppOffline()) return;
    const active = readActivatedBundleId();
    if (active === remoteBundleId) return;

    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      dispatchOtaPush(remoteBundleId);
      onPush();
    }, 800);
  };

  const connect = () => {
    void (async () => {
      if (generation !== subscribeGeneration) return;
      if (!hasPersistedAuthCredentials()) return;

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      if (generation !== subscribeGeneration) return;

      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }

      channel = supabase
        .channel(`platform-ota-push-${generation}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "platform_settings", filter: "id=eq.default" },
          (payload) => {
            const row = payload.new as { ota_latest_bundle_id?: string | null };
            scheduleCheck(row?.ota_latest_bundle_id);
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "platform_settings", filter: "id=eq.default" },
          (payload) => {
            const row = payload.new as { ota_latest_bundle_id?: string | null };
            scheduleCheck(row?.ota_latest_bundle_id);
          }
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV === "development") {
            console.info("[OTA] realtime channel:", status);
          }
        });
    })();
  };

  connect();
  window.addEventListener(ISO_AUTH_READY_EVENT, connect);

  return () => {
    if (generation === subscribeGeneration) subscribeGeneration += 1;
    window.removeEventListener(ISO_AUTH_READY_EVENT, connect);
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (channel) {
      void createClient().removeChannel(channel);
      channel = null;
    }
  };
}
