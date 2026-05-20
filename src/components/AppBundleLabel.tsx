"use client";

import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** Shown on native builds so you can verify APK vs OTA bundle (set at `npm run build:capacitor`). */
export function AppBundleLabel() {
  if (!isCapacitorNativeApp()) return null;

  const label = process.env.NEXT_PUBLIC_APP_BUNDLE_LABEL?.trim();
  if (!label) return null;

  return (
    <div
      className="rounded-lg border-2 border-emerald-500 bg-emerald-100 px-4 py-3 text-center text-base font-bold text-emerald-950 shadow-md"
      role="status"
    >
      ✓ OTA bundle active: {label}
    </div>
  );
}
