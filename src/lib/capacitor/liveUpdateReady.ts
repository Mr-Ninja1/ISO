"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  clearPendingOtaBundle,
  OTA_ACTIVATED_BUNDLE_KEY,
  parseNativeBuild,
  readActivatedBundleId,
  readEmbeddedWebBundleId,
  writeActivatedBundleId,
} from "@/lib/capacitor/liveUpdateClient";

const APK_NATIVE_BUILD_KEY = "iso-apk-native-build:v1";
const WEB_BUNDLE_ID_KEY = "iso-web-bundle-id:v1";
const WEB_BUNDLE_ID_ENV = (process.env.NEXT_PUBLIC_WEB_BUNDLE_ID || "").trim();

let readyPromise: Promise<boolean> | null = null;

async function clearStaleOtaState(): Promise<void> {
  try {
    const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
    await LiveUpdate.reset();
  } catch {
    // bundled assets still load if native reset cleared server path
  }
  clearPendingOtaBundle();
  try {
    localStorage.removeItem(OTA_ACTIVATED_BUNDLE_KEY);
  } catch {
    // ignore
  }
}

async function resetOtaIfNativeBuildChanged(): Promise<void> {
  if (!isCapacitorNativeApp()) return;

  const currentBuild = parseNativeBuild();
  if (!currentBuild) return;

  let lastBuild = 0;
  let lastBundleId = "";
  try {
    lastBuild = Number(localStorage.getItem(APK_NATIVE_BUILD_KEY) || "0");
    lastBundleId = localStorage.getItem(WEB_BUNDLE_ID_KEY) || "";
  } catch {
    // ignore
  }

  const buildChanged = lastBuild > 0 && lastBuild !== currentBuild;
  const bundleChanged = Boolean(
    WEB_BUNDLE_ID_ENV && lastBundleId && lastBundleId !== WEB_BUNDLE_ID_ENV
  );

  if (buildChanged || bundleChanged) {
    await clearStaleOtaState();
    const embedded = readEmbeddedWebBundleId();
    if (embedded) {
      writeActivatedBundleId(embedded);
    }
  } else {
    const embedded = readEmbeddedWebBundleId();
    if (embedded && !readActivatedBundleId()) {
      writeActivatedBundleId(embedded);
    }
  }

  try {
    localStorage.setItem(APK_NATIVE_BUILD_KEY, String(currentBuild));
    if (WEB_BUNDLE_ID_ENV) {
      localStorage.setItem(WEB_BUNDLE_ID_KEY, WEB_BUNDLE_ID_ENV);
    }
  } catch {
    // ignore
  }
}

/**
 * Call as early as possible on native boot so Live Update does not roll back
 * the active bundle while React is still hydrating.
 */
export async function ensureLiveUpdateReady(): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await resetOtaIfNativeBuildChanged();
        const { LiveUpdate } = await import("@capawesome/capacitor-live-update");
        await LiveUpdate.ready();
        return true;
      } catch {
        readyPromise = null;
        return false;
      }
    })();
  }

  return readyPromise;
}

export function resetLiveUpdateReadyForTests() {
  readyPromise = null;
}
