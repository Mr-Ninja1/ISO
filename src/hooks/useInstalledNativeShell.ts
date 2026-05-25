"use client";

import { useEffect, useState } from "react";
import { isInstalledNativeShell } from "@/lib/capacitor/runtime";

/** True when the Capacitor bridge or dev WebView is present (not a normal browser tab on isopro.me). */
export function useInstalledNativeShell(): boolean {
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isInstalledNativeShell() : false
  );

  useEffect(() => {
    const sync = () => setInstalled(isInstalledNativeShell());
    sync();

    const cap = (window as Window & { Capacitor?: { addListener?: unknown } }).Capacitor;
    if (!cap) {
      const id = window.setInterval(sync, 400);
      window.setTimeout(() => window.clearInterval(id), 3000);
      return () => window.clearInterval(id);
    }

    let remove: (() => void) | undefined;
    void import("@capacitor/app")
      .then(({ App }) => App.addListener("appStateChange", sync))
      .then((handle) => {
        remove = () => {
          void handle.remove();
        };
      })
      .catch(() => {
        const id = window.setInterval(sync, 400);
        window.setTimeout(() => window.clearInterval(id), 3000);
        return () => window.clearInterval(id);
      });

    return () => remove?.();
  }, []);

  return installed;
}
