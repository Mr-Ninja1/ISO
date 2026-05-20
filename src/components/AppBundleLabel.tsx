"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** Shown on native builds so you can verify APK vs OTA bundle (set at `npm run build:capacitor`). */
export function AppBundleLabel() {
  if (!isCapacitorNativeApp()) return null;

  const label = process.env.NEXT_PUBLIC_APP_BUNDLE_LABEL?.trim();
  if (!label) return null;

  return (
    <div
      className="rounded-lg border border-emerald-400/60 bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-950 shadow-sm"
      role="status"
    >
      App bundle: {label}
    </div>
  );
}
