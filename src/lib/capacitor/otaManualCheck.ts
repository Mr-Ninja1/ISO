"use client";

import { ensureLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  clearPendingOtaBundle,
  evaluateOtaManifest,
  OTA_CHANNEL_ENV,
  parseNativeBuild,
  parseOtaManifest,
  readActivatedBundleId,
  readPendingOtaBundle,
  writeActivatedBundleId,
  writePendingOtaBundle,
  type OtaPendingBundle,
} from "@/lib/capacitor/liveUpdateClient";
import { apiUrl } from "@/lib/client/apiBase";
import { isAppOffline } from "@/lib/client/appOffline";

type ClientConfig = {
  minNativeBuild?: number | null;
  liveUpdateChannel?: string | null;
  liveUpdateBundleUrl?: string | null;
};

export type OtaCheckResult = {
  status: "idle" | "available" | "up_to_date" | "error";
  message?: string;
  pending?: { bundleId: string; releaseNotes?: string };
};

export const OTA_PENDING_EVENT = "iso-ota-pending";

export function dispatchOtaPending(pending: { bundleId: string; releaseNotes?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OTA_PENDING_EVENT, { detail: pending }));
}

let manualCheckInFlight: Promise<OtaCheckResult> | null = null;

function pendingToResult(pending: OtaPendingBundle, message: string): OtaCheckResult {
  const payload = { bundleId: pending.bundleId, releaseNotes: pending.releaseNotes };
  dispatchOtaPending(payload);
  return { status: "available", pending: payload, message };
}

/** Sync activated/pending state from the native plugin after ready(). */
export async function syncOtaStateFromPlugin(): Promise<OtaPendingBundle | null> {
  if (!isCapacitorNativeApp()) return null;
  const ready = await ensureLiveUpdateReady();
  if (!ready) return readPendingOtaBundle();

  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    const current = (await LiveUpdate.getCurrentBundle().catch(() => ({ bundleId: null }))).bundleId;
    const next = (await LiveUpdate.getNextBundle().catch(() => ({ bundleId: null }))).bundleId;

    if (current) {
      writeActivatedBundleId(current);
      if (current === next) clearPendingOtaBundle();
    }

    const storedPending = readPendingOtaBundle();
    if (next && next !== current) {
      const pending: OtaPendingBundle =
        storedPending?.bundleId === next
          ? storedPending
          : {
              bundleId: next,
              downloadedAt: new Date().toISOString(),
            };
      if (!storedPending || storedPending.bundleId !== next) {
        writePendingOtaBundle(pending);
      }
      return pending;
    }

    return storedPending;
  } catch {
    return readPendingOtaBundle();
  }
}

export async function checkForOtaUpdate(options?: { skipDownload?: boolean }): Promise<OtaCheckResult> {
  if (!isCapacitorNativeApp()) {
    return { status: "idle", message: "OTA is only available in the native app." };
  }
  if (isAppOffline()) {
    return { status: "error", message: "Connect to the internet to check for updates." };
  }

  if (manualCheckInFlight) return manualCheckInFlight;

  manualCheckInFlight = (async () => {
    const currentNativeBuild = parseNativeBuild();
    try {
      const configRes = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
      const config = (await configRes.json().catch(() => ({}))) as ClientConfig;

      const minRequired =
        typeof config.minNativeBuild === "number" && Number.isFinite(config.minNativeBuild)
          ? config.minNativeBuild
          : null;
      if (minRequired != null && currentNativeBuild > 0 && currentNativeBuild < minRequired) {
        return {
          status: "error",
          message: "This app build is below the minimum required version. Install a newer APK.",
        };
      }

      const manifestUrl = (config.liveUpdateBundleUrl || "").trim();
      if (!manifestUrl) {
        return { status: "error", message: "No update server is configured yet." };
      }

      const manifestRes = await fetch(manifestUrl, { cache: "no-store" });
      if (!manifestRes.ok) {
        return { status: "error", message: "Could not reach the update server." };
      }

      const manifest = parseOtaManifest(await manifestRes.json().catch(() => null));
      if (!manifest) {
        return { status: "error", message: "Invalid update manifest." };
      }

      await syncOtaStateFromPlugin();

      const decision = evaluateOtaManifest({
        manifest,
        configuredChannel: config.liveUpdateChannel || OTA_CHANNEL_ENV,
        currentNativeBuild,
        activatedBundleId: readActivatedBundleId(),
        pendingBundle: readPendingOtaBundle(),
      });

      if (decision.action === "prompt_restart") {
        return pendingToResult(
          decision.pending,
          "An update is downloaded. Restart to apply the latest UI changes."
        );
      }

      if (decision.action === "skip") {
        if (decision.reason === "already_activated") {
          return { status: "up_to_date", message: "You are on the latest update." };
        }
        if (decision.reason === "channel_mismatch") {
          return {
            status: "error",
            message: "This update is for a different release channel.",
          };
        }
        return {
          status: "error",
          message: "Install a newer APK to receive this update.",
        };
      }

      if (options?.skipDownload) {
        return { status: "up_to_date", message: "No pending update on device." };
      }

      const ready = await ensureLiveUpdateReady();
      if (!ready) {
        return { status: "error", message: "Live update is not available on this device." };
      }

      const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
      const channel = (config.liveUpdateChannel || manifest.channel || OTA_CHANNEL_ENV).trim();
      if (channel) {
        await LiveUpdate.setChannel({ channel }).catch(() => undefined);
      }

      await LiveUpdate.downloadBundle({
        url: manifest.bundleUrl,
        bundleId: manifest.bundleId,
      });

      const pending: OtaPendingBundle = {
        bundleId: manifest.bundleId,
        releaseNotes: manifest.releaseNotes,
        downloadedAt: new Date().toISOString(),
      };
      writePendingOtaBundle(pending);

      return pendingToResult(pending, "Update downloaded. Restart to apply.");
    } catch {
      return { status: "error", message: "Update check failed." };
    } finally {
      manualCheckInFlight = null;
    }
  })();

  return manualCheckInFlight;
}
