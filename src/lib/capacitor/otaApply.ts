"use client";

import { markOtaReloadStarting } from "@/lib/capacitor/otaBoot";
import { ensureLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { writePendingOtaBundle, type OtaPendingBundle } from "@/lib/capacitor/liveUpdateClient";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

export async function applyDownloadedOtaBundle(pending: {
  bundleId: string;
  releaseNotes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isCapacitorNativeApp()) {
    return { ok: false, message: "OTA is only available in the native app." };
  }

  const ready = await ensureLiveUpdateReady();
  if (!ready) {
    return { ok: false, message: "Live update is not ready. Try again in a moment." };
  }

  const bundle: OtaPendingBundle = {
    bundleId: pending.bundleId,
    releaseNotes: pending.releaseNotes,
    downloadedAt: new Date().toISOString(),
  };
  writePendingOtaBundle(bundle);
  markOtaReloadStarting(pending.bundleId);

  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    await LiveUpdate.setNextBundle({ bundleId: pending.bundleId });
    await LiveUpdate.reload();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Could not restart with the new update. Try again or reinstall the APK.",
    };
  }
}
