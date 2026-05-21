"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Smartphone } from "lucide-react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { setNativeUpdateBlocked } from "@/lib/capacitor/nativeUpdateBlock";
import { openExternalUrl } from "@/lib/capacitor/openExternalUrl";
import {
  fetchPlatformClientConfig,
  isNativeUpdateRequiredFromCache,
  readCachedPlatformClientConfig,
  shouldBlockForNativeUpdate,
} from "@/lib/capacitor/platformClientConfig";

const ENV_APK_URL = (process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

/**
 * Mandatory native update gate — blocks the app when build &lt; platform min_native_build.
 * Native (Capacitor) only; website users are unaffected.
 */
export function NativeUpdateGate() {
  const isNative = isCapacitorNativeApp();
  const currentBuild = useMemo(() => parseNativeBuild(), []);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [blocked, setBlocked] = useState(() =>
    isNative ? isNativeUpdateRequiredFromCache(currentBuild) : false
  );
  const [minRequired, setMinRequired] = useState<number | null>(() => {
    const cached = readCachedPlatformClientConfig();
    const min = cached?.minNativeBuild;
    return typeof min === "number" && Number.isFinite(min) ? min : null;
  });
  const [apkUrl, setApkUrl] = useState("");
  const [statusHint, setStatusHint] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setNativeUpdateBlocked(blocked && initialCheckDone);
    return () => setNativeUpdateBlocked(false);
  }, [blocked, initialCheckDone]);

  const check = useCallback(
    async (options?: { background?: boolean }) => {
      if (!isNative) {
        setBlocked(false);
        setInitialCheckDone(true);
        return;
      }

      const background = options?.background === true;
      if (!background && !initialCheckDone) {
        // First paint may use cache; full fetch runs without unmounting a visible gate.
      }
      if (background) setRefreshing(true);

      const { config, fromCache, fetchFailed } = await fetchPlatformClientConfig();
      const min = config.minNativeBuild ?? null;
      const url = (config.latestApkUrl || ENV_APK_URL || "").trim();

      setMinRequired(min);
      setApkUrl(url);

      const needsBlock = shouldBlockForNativeUpdate(currentBuild, min);
      setBlocked(needsBlock);

      if (fetchFailed && needsBlock && fromCache) {
        setStatusHint("Using last known update policy (offline).");
      } else if (fetchFailed && !fromCache) {
        setStatusHint("Could not reach the server to verify the required app version.");
        setBlocked(false);
      } else {
        setStatusHint("");
      }

      setInitialCheckDone(true);
      setRefreshing(false);
    },
    [isNative, currentBuild, initialCheckDone]
  );

  useEffect(() => {
    void check();

    const onVisible = () => {
      if (document.visibilityState === "visible") void check({ background: true });
    };
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => void check({ background: true }), 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [check]);

  if (!isNative || !blocked || minRequired == null) {
    return null;
  }

  function openApkDownload() {
    const target = apkUrl;
    if (!target) return;
    void openExternalUrl(target);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--hse-charcoal)]/92 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="native-update-gate-title"
      data-iso-native-update-gate="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-[color-mix(in_srgb,var(--hse-copper)_35%,transparent)] bg-[var(--hse-cream)] p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
            <Smartphone className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--hse-teal-mid)]">
              Update required
            </p>
            <h2 id="native-update-gate-title" className="text-lg font-bold text-[var(--hse-charcoal)]">
              Install the latest ISO Pro app
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--accent-soft)]">
          This device is on build <strong className="text-[var(--hse-charcoal)]">{currentBuild}</strong>.
          Build <strong className="text-[var(--hse-charcoal)]">{minRequired}</strong> or newer is required for
          compatibility and security. Web-only updates cannot replace the native shell — you need a new APK.
        </p>

        {statusHint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {statusHint}
          </p>
        ) : null}

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--accent-soft)]">
          <li>Tap <strong className="text-[var(--hse-charcoal)]">Download APK</strong> below.</li>
          <li>Open the downloaded file when prompted.</li>
          <li>Allow install from this source if Android asks.</li>
          <li>Open ISO Pro again after installation completes.</li>
        </ol>

        {apkUrl ? (
          <button
            type="button"
            onClick={openApkDownload}
            className="ws-btn-primary mt-6 inline-flex h-11 w-full items-center justify-center gap-2 px-4 text-sm"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download APK
          </button>
        ) : (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Ask your administrator for the latest APK — the download link is not configured yet.
          </p>
        )}

        <button
          type="button"
          onClick={() => void check({ background: true })}
          disabled={refreshing}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--hse-teal)] bg-white text-sm font-semibold text-[var(--hse-teal)] disabled:opacity-60"
        >
          <Loader2 className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {refreshing ? "Checking…" : "I installed it — check again"}
        </button>
      </div>
    </div>
  );
}
