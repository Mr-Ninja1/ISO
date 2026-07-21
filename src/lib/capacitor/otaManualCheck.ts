"use client";

import { ensureLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { consumeOtaReloadSessionBundleId } from "@/lib/capacitor/otaBoot";
import {
  clearPendingOtaBundle,
  evaluateOtaManifest,
  isEmbeddedBundleNewerThanManifest,
  OTA_CHANNEL_ENV,
  parseNativeBuild,
  parseOtaManifest,
  readActivatedBundleId,
  readEmbeddedWebBundleId,
  readPendingOtaBundle,
  resolveActiveBundleId,
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

function formatOtaError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Update check failed.";
}

function isBundleAlreadyOnDevice(error: unknown): boolean {
  const message = formatOtaError(error).toLowerCase();
  return message.includes("bundle already exists");
}

async function bundleDownloadedOnDevice(bundleId: string): Promise<boolean> {
  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    const result = await LiveUpdate.getDownloadedBundles();
    return (result.bundleIds || []).includes(bundleId);
  } catch {
    return false;
  }
}

function pendingToResult(pending: OtaPendingBundle, message: string): OtaCheckResult {
  const payload = { bundleId: pending.bundleId, releaseNotes: pending.releaseNotes };
  dispatchOtaPending(payload);
  return { status: "available", pending: payload, message };
}

async function discardStaleDownloadedBundle(bundleId: string) {
  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    await LiveUpdate.deleteBundle({ bundleId });
  } catch {
    // ignore
  }
}

function isRunningEmbeddedApkBundle(): boolean {
  const embedded = readEmbeddedWebBundleId();
  const activated = readActivatedBundleId();
  return Boolean(embedded && activated === embedded);
}

async function clearOrphanedOtaDownloads(currentBundleId?: string | null) {
  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    const { bundleIds } = await LiveUpdate.getDownloadedBundles();
    for (const id of bundleIds || []) {
      if (id && id !== currentBundleId) {
        await discardStaleDownloadedBundle(id);
      }
    }
  } catch {
    // ignore
  }
  clearPendingOtaBundle();
}

/** Sync activated/pending state from the native plugin after ready(). */
export async function syncOtaStateFromPlugin(): Promise<OtaPendingBundle | null> {
  if (!isCapacitorNativeApp()) return null;
  const ready = await ensureLiveUpdateReady();
  if (!ready) return readPendingOtaBundle();

  const reloadedBundleId = consumeOtaReloadSessionBundleId();
  if (reloadedBundleId) {
    writeActivatedBundleId(reloadedBundleId);
    clearPendingOtaBundle();
  }

  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    const current = (await LiveUpdate.getCurrentBundle().catch(() => ({ bundleId: null }))).bundleId;
    const next = (await LiveUpdate.getNextBundle().catch(() => ({ bundleId: null }))).bundleId;

    if (current) {
      writeActivatedBundleId(current);
      if (current === next) clearPendingOtaBundle();
    } else if (!readActivatedBundleId()) {
      const embedded = resolveActiveBundleId(null, current);
      if (embedded) writeActivatedBundleId(embedded);
    }

    const storedPending = readPendingOtaBundle();
    if (next && next !== current) {
      if (isRunningEmbeddedApkBundle()) {
        await clearOrphanedOtaDownloads(current);
        return null;
      }
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

    // Download finished but setNextBundle was never called (e.g. manual check hit "bundle already exists").
    try {
      const { bundleIds } = await LiveUpdate.getDownloadedBundles();
      const pendingId = (bundleIds || []).find((id) => id && id !== current);
      if (pendingId) {
        if (isRunningEmbeddedApkBundle()) {
          await clearOrphanedOtaDownloads(current);
          return null;
        }
        const pending: OtaPendingBundle =
          storedPending?.bundleId === pendingId
            ? storedPending
            : {
                bundleId: pendingId,
                downloadedAt: new Date().toISOString(),
              };
        if (!storedPending || storedPending.bundleId !== pendingId) {
          writePendingOtaBundle(pending);
        }
        return pending;
      }
    } catch {
      // ignore
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
      if (!configRes.ok) {
        return {
          status: "error",
          message: `Could not reach the update server (${configRes.status}).`,
        };
      }
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

      if (decision.action === "skip" && decision.reason === "already_activated") {
        const pending = readPendingOtaBundle();
        if (pending?.bundleId && pending.bundleId !== manifest.bundleId) {
          clearPendingOtaBundle();
          await discardStaleDownloadedBundle(pending.bundleId);
        }
        if (isEmbeddedBundleNewerThanManifest(manifest)) {
          await discardStaleDownloadedBundle(manifest.bundleId);
        }
      }

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
        const required = manifest.minNativeBuild ?? minRequired;
        return {
          status: "error",
          message:
            decision.reason === "native_build_too_old" && required != null && currentNativeBuild > 0
              ? `Install a newer APK (app build ${currentNativeBuild}, update requires ${required}).`
              : "Install a newer APK to receive this update.",
        };
      }

      if (options?.skipDownload) {
        return { status: "up_to_date", message: "No pending update on device." };
      }

      const ready = await ensureLiveUpdateReady();
      if (!ready) {
        return { status: "error", message: "Live update is not available on this device." };
      }

      const pending: OtaPendingBundle = {
        bundleId: manifest.bundleId,
        releaseNotes: manifest.releaseNotes,
        downloadedAt: new Date().toISOString(),
      };

      const alreadyDownloaded = await bundleDownloadedOnDevice(manifest.bundleId);
      if (alreadyDownloaded) {
        writePendingOtaBundle(pending);
        return pendingToResult(pending, "Update already downloaded. Restart to apply.");
      }

      const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
      const channel = (config.liveUpdateChannel || manifest.channel || OTA_CHANNEL_ENV).trim();
      if (channel) {
        await LiveUpdate.setChannel({ channel }).catch(() => undefined);
      }

      try {
        await LiveUpdate.downloadBundle({
          url: manifest.bundleUrl,
          bundleId: manifest.bundleId,
        });
      } catch (error) {
        if (isBundleAlreadyOnDevice(error)) {
          writePendingOtaBundle(pending);
          return pendingToResult(pending, "Update already downloaded. Restart to apply.");
        }
        throw error;
      }

      writePendingOtaBundle(pending);

      return pendingToResult(pending, "Update downloaded. Restart to apply.");
    } catch (error) {
      return { status: "error", message: formatOtaError(error) };
    } finally {
      manualCheckInFlight = null;
    }
  })();

  return manualCheckInFlight;
}
