"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { applyDownloadedOtaBundle } from "@/lib/capacitor/otaApply";
import { ISO_AUTH_READY_EVENT } from "@/lib/capacitor/otaEvents";
import { ensureLiveUpdateReady } from "@/lib/capacitor/liveUpdateReady";
import { clearOtaBootGracePeriod, isWithinOtaBootGracePeriod } from "@/lib/capacitor/otaBoot";
import {
  checkForOtaUpdate,
  dispatchOtaPending,
  OTA_PENDING_EVENT,
  syncOtaStateFromPlugin,
} from "@/lib/capacitor/otaManualCheck";
import { readPendingOtaBundle } from "@/lib/capacitor/liveUpdateClient";
import { OTA_PUSH_EVENT, subscribeToOtaRealtime } from "@/lib/capacitor/otaRealtime";
import { remoteOtaBundleDiffersFromActive } from "@/lib/capacitor/otaRemoteSignal";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { INTERNET_RESTORED_EVENT, isAppOffline } from "@/lib/client/appOffline";

type PendingUpdate = {
  bundleId: string;
  releaseNotes?: string;
};

/** Fallback if Realtime is unavailable (hours, not seconds). */
const FALLBACK_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const FOREGROUND_CHECK_GAP_MS = 20 * 60 * 1000;

/**
 * OTA: Supabase Realtime pushes when a new bundle is published; light fallback checks otherwise.
 */
export function LiveUpdateBootstrap() {
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const checkGeneration = useRef(0);
  const checkInFlight = useRef(false);
  const lastCheckAt = useRef(0);

  const showPending = useCallback((next: PendingUpdate) => {
    setPending(next);
    dispatchOtaPending(next);
  }, []);

  const restorePendingFromDevice = useCallback(async () => {
    const fromPlugin = await syncOtaStateFromPlugin();
    const stored = fromPlugin ?? readPendingOtaBundle();
    if (stored?.bundleId) {
      showPending({ bundleId: stored.bundleId, releaseNotes: stored.releaseNotes });
      return true;
    }
    return false;
  }, [showPending]);

  const runBackgroundCheck = useCallback(
    async (reason: string, options?: { force?: boolean }) => {
      if (!isCapacitorNativeApp() || isAppOffline()) return;
      if (checkInFlight.current) return;

      const now = Date.now();
      if (!options?.force && now - lastCheckAt.current < 12_000) return;

      checkInFlight.current = true;
      lastCheckAt.current = now;
      const generation = ++checkGeneration.current;

      try {
        const result = await checkForOtaUpdate();
        if (generation !== checkGeneration.current) return;

        if (result.status === "available" && result.pending) {
          showPending(result.pending);
        } else if (process.env.NODE_ENV === "development" && result.status !== "idle") {
          console.info(`[OTA] check (${reason}):`, result.status, result.message);
        }
      } finally {
        checkInFlight.current = false;
      }
    },
    [showPending]
  );

  const runCheckIfRemoteNewer = useCallback(
    async (reason: string) => {
      const differs = await remoteOtaBundleDiffersFromActive();
      if (differs) {
        await runBackgroundCheck(reason, { force: true });
      }
    },
    [runBackgroundCheck]
  );

  useLayoutEffect(() => {
    if (!isCapacitorNativeApp()) return;
    void ensureLiveUpdateReady();
  }, []);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    function onPending(ev: Event) {
      const detail = (ev as CustomEvent<PendingUpdate>).detail;
      if (detail?.bundleId) setPending(detail);
    }

    function onOtaPush() {
      void runBackgroundCheck("realtime-push", { force: true });
    }

    function onAuthReady() {
      void runCheckIfRemoteNewer("auth-ready");
      // Realtime needs a session — (re)subscribe after login hydration.
    }

    function onInternetRestored() {
      window.setTimeout(() => void runCheckIfRemoteNewer("internet-restored"), 1_000);
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const gap = Date.now() - lastCheckAt.current;
      if (gap < FOREGROUND_CHECK_GAP_MS) return;
      window.setTimeout(() => void runCheckIfRemoteNewer("foreground"), 800);
    }

    window.addEventListener(OTA_PENDING_EVENT, onPending);
    window.addEventListener(OTA_PUSH_EVENT, onOtaPush);
    window.addEventListener(ISO_AUTH_READY_EVENT, onAuthReady);
    window.addEventListener(INTERNET_RESTORED_EVENT, onInternetRestored);
    window.addEventListener("online", onInternetRestored);
    document.addEventListener("visibilitychange", onVisible);

    const removeRealtime = subscribeToOtaRealtime(() => {
      void runBackgroundCheck("realtime", { force: true });
    });

    void (async () => {
      await ensureLiveUpdateReady();
      await restorePendingFromDevice();

      if (isWithinOtaBootGracePeriod()) {
        clearOtaBootGracePeriod();
      }

      await runCheckIfRemoteNewer("cold-start");
    })();

    const timer = window.setInterval(
      () => void runCheckIfRemoteNewer("fallback-interval"),
      FALLBACK_CHECK_INTERVAL_MS
    );

    return () => {
      checkGeneration.current += 1;
      window.removeEventListener(OTA_PENDING_EVENT, onPending);
      window.removeEventListener(OTA_PUSH_EVENT, onOtaPush);
      window.removeEventListener(ISO_AUTH_READY_EVENT, onAuthReady);
      window.removeEventListener(INTERNET_RESTORED_EVENT, onInternetRestored);
      window.removeEventListener("online", onInternetRestored);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      removeRealtime();
    };
  }, [restorePendingFromDevice, runBackgroundCheck, runCheckIfRemoteNewer]);

  async function applyUpdate() {
    if (!pending || applying) return;
    setApplying(true);
    setApplyError(null);
    const result = await applyDownloadedOtaBundle(pending);
    if (!result.ok) {
      setApplying(false);
      setApplyError(result.message);
    }
  }

  if (!pending) return null;

  const messageBase = pending.releaseNotes?.trim()
    ? `Version ${pending.bundleId} is ready. Restart to apply UI changes:\n\n${pending.releaseNotes}`
    : `Version ${pending.bundleId} is ready. Restart now to apply the latest UI changes.`;

  return (
    <NotificationModal
      open
      title="App update ready"
      message={applyError ? `${messageBase}\n\n${applyError}` : messageBase}
      actionLabel={applying ? "Restarting…" : "Restart now"}
      cancelLabel="Later"
      onClose={() => {
        setApplyError(null);
        setPending(null);
      }}
      onCancel={() => {
        setApplyError(null);
        setPending(null);
      }}
      onAction={() => void applyUpdate()}
    />
  );
}
