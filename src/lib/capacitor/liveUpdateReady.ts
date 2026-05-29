"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

let readyPromise: Promise<boolean> | null = null;

/**
 * Call as early as possible on native boot so Live Update does not roll back
 * the active bundle while React is still hydrating.
 */
export async function ensureLiveUpdateReady(): Promise<boolean> {
  if (!isCapacitorNativeApp()) return false;

  if (!readyPromise) {
    readyPromise = (async () => {
      try {
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
