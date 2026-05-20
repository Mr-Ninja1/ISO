"use client";

import { useEffect, useMemo, useState } from "react";
import { NotificationModal } from "@/components/NotificationModal";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { apiUrl } from "@/lib/client/apiBase";

function parseNativeBuild(): number {
  const raw = process.env.NEXT_PUBLIC_NATIVE_BUILD;
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sideloaded Capacitor builds: compare embedded build number to platform_settings.min_native_build.
 * Bump NEXT_PUBLIC_NATIVE_BUILD when you ship a new APK users must install.
 */
export function NativeUpdateNudge() {
  const [open, setOpen] = useState(false);
  const [minRequired, setMinRequired] = useState<number | null>(null);
  const currentBuild = useMemo(() => parseNativeBuild(), []);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    if (!currentBuild) return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(apiUrl("/api/platform/client-config"), { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { minNativeBuild?: number | null };
        if (cancelled) return;
        const min = typeof json.minNativeBuild === "number" && Number.isFinite(json.minNativeBuild) ? json.minNativeBuild : null;
        if (min == null || min <= currentBuild) return;

        try {
          if (localStorage.getItem(`iso-native-build-dismissed:v1:${min}`) === "1") return;
        } catch {
          // ignore
        }

        setMinRequired(min);
        setOpen(true);
      } catch {
        // ignore
      }
    }

    void check();
    const t = window.setInterval(check, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [currentBuild]);

  if (!currentBuild) return null;

  function dismissPersisted() {
    if (minRequired != null) {
      try {
        localStorage.setItem(`iso-native-build-dismissed:v1:${minRequired}`, "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
  }

  return (
    <NotificationModal
      open={open}
      title="App update required"
      message="This device is running an older native build. Install the latest APK from your administrator to continue receiving fixes and compatibility updates."
      actionLabel="Got it"
      cancelLabel="Remind me later"
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onAction={dismissPersisted}
    />
  );
}
