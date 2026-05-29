"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Smartphone } from "lucide-react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { parseNativeBuild } from "@/lib/capacitor/liveUpdateClient";
import { apiUrl } from "@/lib/client/apiBase";

type ClientConfig = {
  minNativeBuild?: number | null;
  latestApkUrl?: string | null;
};

const ENV_APK_URL = (process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

/**
 * Mandatory native update gate — blocks the app when build &lt; platform min_native_build.
 * Native (Capacitor) only; website users are unaffected.
 */
export function NativeUpdateGate() {
  const currentBuild = useMemo(() => parseNativeBuild(), []);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [minRequired, setMinRequired] = useState<number | null>(null);
  const [apkUrl, setApkUrl] = useState("");

  const check = useCallback(async () => {
    if (!isCapacitorNativeApp() || !currentBuild) {
      setBlocked(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ClientConfig;
      const min =
        typeof json.minNativeBuild === "number" && Number.isFinite(json.minNativeBuild)
          ? json.minNativeBuild
          : null;
      const url = (json.latestApkUrl || ENV_APK_URL || "").trim();

      setMinRequired(min);
      setApkUrl(url);

      if (min != null && currentBuild < min) {
        setBlocked(true);
      } else {
        setBlocked(false);
      }
    } catch {
      setBlocked(false);
    } finally {
      setLoading(false);
    }
  }, [currentBuild]);

  useEffect(() => {
    void check();
    const t = window.setInterval(() => void check(), 30 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [check]);

  if (!isCapacitorNativeApp() || !currentBuild || loading || !blocked || minRequired == null) {
    return null;
  }

  function openApkDownload() {
    const target = apkUrl;
    if (!target) return;
    try {
      window.open(target, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = target;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--hse-charcoal)]/92 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="native-update-gate-title"
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
              Install the latest ISO Grid app
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-[var(--accent-soft)]">
          This device is on build <strong className="text-[var(--hse-charcoal)]">{currentBuild}</strong>.
          Build <strong className="text-[var(--hse-charcoal)]">{minRequired}</strong> or newer is required for
          compatibility and security. Web-only updates cannot replace the native shell — you need a new APK.
        </p>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[var(--accent-soft)]">
          <li>Tap <strong className="text-[var(--hse-charcoal)]">Download APK</strong> below.</li>
          <li>Open the downloaded file when prompted.</li>
          <li>Allow install from this source if Android asks.</li>
          <li>Open ISO Grid again after installation completes.</li>
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
          onClick={() => void check()}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--hse-teal)] bg-white text-sm font-semibold text-[var(--hse-teal)]"
        >
          <Loader2 className="h-3.5 w-3.5" aria-hidden />
          I installed it — check again
        </button>
      </div>
    </div>
  );
}
