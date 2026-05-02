"use client";

import { useEffect, useState } from "react";
import { isAppOffline, OFFLINE_MODE_CHANGED_EVENT } from "./appOffline";

/** Reactive offline state (browser + `window.__ISO_FORCE_OFFLINE__` from mobile shell). */
export function useAppOffline(): boolean {
  const [offline, setOffline] = useState(() =>
    typeof window !== "undefined" ? isAppOffline() : false
  );

  useEffect(() => {
    const sync = () => setOffline(isAppOffline());

    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  return offline;
}
