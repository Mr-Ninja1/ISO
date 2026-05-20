"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  OTA_CHANNEL_ENV,
  parseNativeBuild,
  parseOtaManifest,
  readAppliedBundleId,
  shouldApplyOtaManifest,
  writeAppliedBundleId,
} from "@/lib/capacitor/liveUpdateClient";
import { apiUrl } from "@/lib/client/apiBase";
import { isAppOffline } from "@/lib/client/appOffline";

type ClientConfig = {
  minNativeBuild?: number | null;
  liveUpdateChannel?: string | null;
  liveUpdateBundleUrl?: string | null;
};

type PendingUpdate = {
  bundleId: string;
  releaseNotes?: string;
};

/**
 * Self-hosted OTA for bundled Capacitor APKs.
 * Reads manifest URL from platform_settings, downloads zip via @capawesome/capacitor-live-update.
 */
export function LiveUpdateBootstrap() {
  const currentNativeBuild = useMemo(() => parseNativeBuild(), []);
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [applying, setApplying] = useState(false);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!isCapacitorNativeApp()) return;
    if (isAppOffline()) return;
    if (checkingRef.current) return;

    checkingRef.current = true;
    try {
      const configRes = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
      const config = (await configRes.json().catch(() => ({}))) as ClientConfig;

      const minRequired =
        typeof config.minNativeBuild === "number" && Number.isFinite(config.minNativeBuild)
          ? config.minNativeBuild
          : null;
      if (minRequired != null && currentNativeBuild > 0 && currentNativeBuild < minRequired) {
        return;
      }

      const manifestUrl = (config.liveUpdateBundleUrl || "").trim();
      if (!manifestUrl) return;

      const manifestRes = await fetch(manifestUrl, { cache: "no-store" });
      if (!manifestRes.ok) return;

      const manifest = parseOtaManifest(await manifestRes.json().catch(() => null));
      if (!manifest) return;

      const decision = shouldApplyOtaManifest({
        manifest,
        configuredChannel: config.liveUpdateChannel || OTA_CHANNEL_ENV,
        currentNativeBuild,
        appliedBundleId: readAppliedBundleId(),
      });

      if (!decision.apply) return;

      try {
        const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
        await LiveUpdate.ready();

        const channel = (config.liveUpdateChannel || manifest.channel || OTA_CHANNEL_ENV).trim();
        if (channel) {
          await LiveUpdate.setChannel({ channel }).catch(() => undefined);
        }

        await LiveUpdate.downloadBundle({
          url: manifest.bundleUrl,
          bundleId: manifest.bundleId,
        });

        writeAppliedBundleId(manifest.bundleId);
        setPending({
          bundleId: manifest.bundleId,
          releaseNotes: manifest.releaseNotes,
        });
      } catch {
        // Plugin missing until cap sync, or download failed — silent on device
      }
    } catch {
      // ignore network errors
    } finally {
      checkingRef.current = false;
    }
  }, [currentNativeBuild]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    void (async () => {
      try {
        const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
        await LiveUpdate.ready();
      } catch {
        // Plugin not linked yet
      }
      void checkForUpdate();
    })();

    const timer = window.setInterval(() => void checkForUpdate(), 4 * 60 * 60 * 1000);

    function onOnline() {
      void checkForUpdate();
    }
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [checkForUpdate]);

  async function applyUpdate() {
    if (!pending || applying) return;
    setApplying(true);
    try {
      const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
      await LiveUpdate.setNextBundle({ bundleId: pending.bundleId });
      await LiveUpdate.reload();
    } catch {
      setApplying(false);
    }
  }

  if (!pending) return null;

  return (
    <NotificationModal
      open
      title="App update ready"
      message={
        pending.releaseNotes?.trim()
          ? `A new version (${pending.bundleId}) is downloaded. Restart to apply:\n\n${pending.releaseNotes}`
          : `A new version (${pending.bundleId}) is downloaded. Restart now to apply the latest fixes and features.`
      }
      actionLabel={applying ? "Restarting…" : "Restart now"}
      cancelLabel="Later"
      onClose={() => setPending(null)}
      onCancel={() => setPending(null)}
      onAction={() => void applyUpdate()}
    />
  );
}
