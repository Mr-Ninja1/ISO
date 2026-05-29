"use client";

import { useEffect, useState } from "react";
import { readActivatedBundleId } from "@/lib/capacitor/liveUpdateClient";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** Native-only label so you can confirm which OTA bundle is active after restart. */
export function OtaBundleBadge() {
  const [bundleId, setBundleId] = useState<string | null>(null);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    const read = () => {
      try {
        setBundleId(readActivatedBundleId());
      } catch {
        setBundleId(null);
      }
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);

  if (!isCapacitorNativeApp()) return null;

  return (
    <span
      className="inline-flex max-w-[11rem] truncate rounded-full border border-violet-300/80 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-900"
      title="Active OTA web bundle"
    >
      Bundle: {bundleId || "built-in"}
    </span>
  );
}
