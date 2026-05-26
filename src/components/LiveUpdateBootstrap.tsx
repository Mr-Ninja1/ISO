"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { dispatchOtaStatus } from "@/lib/capacitor/otaStatusEvents";
import {
  OTA_CHANNEL_ENV,
  parseNativeBuild,
  parseOtaManifest,
  readAppliedBundleId,
  shouldApplyOtaManifest,
  writeAppliedBundleId,
} from "@/lib/capacitor/liveUpdateClient";
import {
  markOtaReloadPending,
  signalLiveUpdateReady,
  wasOtaReloadRecent,
} from "@/lib/capacitor/liveUpdateReady";
import { apiUrl } from "@/lib/client/apiBase";
import { isAppOffline } from "@/lib/client/appOffline";
import { isNativeEntryShellPath } from "@/lib/capacitor/nativeEntryNavigation";

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
 * Reads manifest URL from platform_settings via /api/platform/client-config.
 */
export function LiveUpdateBootstrap() {
  const currentNativeBuild = useMemo(() => parseNativeBuild(), []);
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [applying, setApplying] = useState(false);
  const checkingRef = useRef(false);

  const emitStatus = useCallback(
    (
      phase: Parameters<typeof dispatchOtaStatus>[0]["phase"],
      message: string,
      extra?: Partial<Parameters<typeof dispatchOtaStatus>[0]>
    ) => {
      dispatchOtaStatus({
        phase,
        message,
        nativeBuild: currentNativeBuild,
        appliedBundleId: readAppliedBundleId(),
        checkedAt: Date.now(),
        ...extra,
      });
    },
    [currentNativeBuild]
  );

  const checkForUpdate = useCallback(async () => {
    if (!isCapacitorNativeApp()) return;
    if (checkingRef.current) return;
    if (wasOtaReloadRecent()) return;

    if (isAppOffline()) {
      emitStatus("offline", "Offline — updates resume when you are back online.");
      return;
    }

    checkingRef.current = true;
    emitStatus("checking", "Checking for updates…");

    try {
      const configRes = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
      const config = (await configRes.json().catch(() => ({}))) as ClientConfig & { error?: string };

      if (!configRes.ok) {
        emitStatus(
          "error",
          configRes.status === 404
            ? "Update server endpoint missing — deploy the latest website build."
            : config.error || `Update config failed (${configRes.status}).`
        );
        return;
      }

      const minRequired =
        typeof config.minNativeBuild === "number" && Number.isFinite(config.minNativeBuild)
          ? config.minNativeBuild
          : null;
      if (
        minRequired != null &&
        Number.isFinite(currentNativeBuild) &&
        currentNativeBuild < minRequired
      ) {
        emitStatus("error", `Install a newer APK (build ${minRequired}+ required).`);
        return;
      }

      const manifestUrl = (config.liveUpdateBundleUrl || "").trim();
      if (!manifestUrl) {
        emitStatus("error", "No OTA manifest URL configured in platform settings.");
        return;
      }

      const manifestRes = await fetch(manifestUrl, { cache: "no-store" });
      if (!manifestRes.ok) {
        emitStatus("error", `Manifest unreachable (${manifestRes.status}).`);
        return;
      }

      const manifest = parseOtaManifest(await manifestRes.json().catch(() => null));
      if (!manifest) {
        emitStatus("error", "Manifest file is invalid.");
        return;
      }

      const decision = shouldApplyOtaManifest({
        manifest,
        configuredChannel: config.liveUpdateChannel || OTA_CHANNEL_ENV,
        currentNativeBuild,
        appliedBundleId: readAppliedBundleId(),
      });

      if (!decision.apply) {
        emitStatus("uptodate", "You have the latest web bundle.", {
          availableBundleId: manifest.bundleId,
        });
        return;
      }

      emitStatus("downloading", `Downloading ${manifest.bundleId}…`, {
        availableBundleId: manifest.bundleId,
      });

      try {
        const { LiveUpdate } = await import("@capawesome/capacitor-live-update");

        const channel = (config.liveUpdateChannel || manifest.channel || OTA_CHANNEL_ENV).trim();
        if (channel) {
          await LiveUpdate.setChannel({ channel }).catch(() => undefined);
        }

        await LiveUpdate.downloadBundle({
          url: manifest.bundleUrl,
          bundleId: manifest.bundleId,
        });

        setPending({
          bundleId: manifest.bundleId,
          releaseNotes: manifest.releaseNotes,
        });
        emitStatus("ready", "Restart to apply the downloaded update.", {
          availableBundleId: manifest.bundleId,
        });
      } catch {
        emitStatus("error", "Download failed — try again on Wi‑Fi or install a fresh APK.");
      }
    } catch {
      emitStatus("error", "Could not reach the update server.");
    } finally {
      checkingRef.current = false;
    }
  }, [currentNativeBuild, emitStatus]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    void signalLiveUpdateReady();

    const scheduleCheckWhenPastEntry = () => {
      if (wasOtaReloadRecent()) return;
      if (isNativeEntryShellPath()) {
        window.setTimeout(scheduleCheckWhenPastEntry, 2000);
        return;
      }
      void checkForUpdate();
    };

    const startCheck = window.setTimeout(scheduleCheckWhenPastEntry, wasOtaReloadRecent() ? 20_000 : 8000);

    const timer = window.setInterval(() => void checkForUpdate(), 2 * 60 * 60 * 1000);

    function onOnline() {
      if (!wasOtaReloadRecent()) void checkForUpdate();
    }

    function onVisible() {
      if (document.visibilityState === "visible" && !wasOtaReloadRecent()) {
        void checkForUpdate();
      }
    }

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(startCheck);
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkForUpdate]);

  async function applyUpdate() {
    if (!pending || applying) return;
    setApplying(true);
    try {
      const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
      writeAppliedBundleId(pending.bundleId);
      markOtaReloadPending();
      await LiveUpdate.setNextBundle({ bundleId: pending.bundleId });
      await LiveUpdate.reload();
    } catch {
      setApplying(false);
      emitStatus("error", "Restart failed — close the app completely and open again.");
    }
  }

  return (
    <>
      {pending ? (
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
      ) : null}
    </>
  );
}
