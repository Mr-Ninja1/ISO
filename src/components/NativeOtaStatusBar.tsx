"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  OTA_STATUS_EVENT,
  type OtaStatusDetail,
  type OtaUiPhase,
} from "@/lib/capacitor/otaStatusEvents";
import { parseNativeBuild, readAppliedBundleId } from "@/lib/capacitor/liveUpdateClient";

const PHASE_LABEL: Record<OtaUiPhase, string> = {
  idle: "Checking for app updates…",
  checking: "Checking for updates…",
  uptodate: "App is up to date",
  downloading: "Downloading update…",
  ready: "Update ready — open the restart prompt",
  error: "Could not check for updates",
  offline: "Offline — updates when connected",
};

export function NativeOtaStatusBar() {
  const [detail, setDetail] = useState<OtaStatusDetail>(() => ({
    phase: "idle",
    message: PHASE_LABEL.idle,
    appliedBundleId: readAppliedBundleId(),
    nativeBuild: parseNativeBuild(),
    checkedAt: Date.now(),
  }));

  const syncFromEvent = useCallback((next: OtaStatusDetail) => {
    setDetail({
      ...next,
      appliedBundleId: next.appliedBundleId ?? readAppliedBundleId(),
      nativeBuild: next.nativeBuild ?? parseNativeBuild(),
    });
  }, []);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const onStatus = (event: Event) => {
      const custom = event as CustomEvent<OtaStatusDetail>;
      if (custom.detail) syncFromEvent(custom.detail);
    };

    window.addEventListener(OTA_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(OTA_STATUS_EVENT, onStatus);
  }, [syncFromEvent]);

  if (!isCapacitorNativeApp()) return null;

  const applied = detail.appliedBundleId || "bundled";
  const build = detail.nativeBuild ?? parseNativeBuild();
  const phase = detail.phase;
  const tone =
    phase === "ready"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : phase === "error"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-[color-mix(in_srgb,var(--hse-teal)_18%,transparent)] bg-[color-mix(in_srgb,var(--hse-sky)_55%,white)] text-[var(--hse-charcoal)]";

  return (
    <div
      className={`border-b px-3 py-2 text-xs sm:px-4 ${tone}`}
      role="status"
      aria-live="polite"
      data-iso-ota-status-bar="true"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {phase === "checking" || phase === "downloading" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          Installed app
        </span>
        <span>
          Build <strong>{build}</strong> · Bundle <strong>{applied}</strong>
        </span>
        <span className="text-foreground/75">{detail.message || PHASE_LABEL[phase]}</span>
        {detail.availableBundleId && detail.availableBundleId !== applied ? (
          <span className="rounded-full bg-white/80 px-2 py-0.5 font-medium ring-1 ring-amber-300">
            New: {detail.availableBundleId}
          </span>
        ) : null}
      </div>
    </div>
  );
}
