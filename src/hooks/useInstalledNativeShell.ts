"use client";

import { useEffect, useState } from "react";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

/** Re-check so menu items hide as soon as the Capacitor bridge is available. */
export function useInstalledNativeShell(): boolean {
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isCapacitorNativeApp() : false
  );

  useEffect(() => {
    setInstalled(isCapacitorNativeApp());

    const cap = (window as Window & { Capacitor?: { addListener?: unknown } }).Capacitor;
    if (!cap) return;

    let remove: (() => void) | undefined;
    void import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", () => setInstalled(isCapacitorNativeApp())))
      .then((handle) => {
        remove = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        const id = window.setInterval(() => setInstalled(isCapacitorNativeApp()), 500);
        window.setTimeout(() => window.clearInterval(id), 3000);
      });

    return () => remove?.();
  }, []);

  return installed;
}
