"use client";

import { useEffect, useState } from "react";
import { isAppOffline, INTERNET_RESTORED_EVENT, OFFLINE_MODE_CHANGED_EVENT, initInternetStatusMonitor } from "./appOffline";
import { initReachabilityMonitor } from "./reachability";

/** Reactive offline state (browser + `window.__ISO_FORCE_OFFLINE__` from mobile shell). */
export function useAppOffline(): boolean {
  const [offline, setOffline] = useState(() =>
    typeof window !== "undefined" ? isAppOffline() : false
  );

  useEffect(() => {
    const sync = () => setOffline(isAppOffline());

    sync();
    const unsubscribe = initInternetStatusMonitor();
    const stopReachability = initReachabilityMonitor();
    
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);

    return () => {
      unsubscribe();
      stopReachability();
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  return offline;
}

export function useOnInternetRestored(callback: () => void) {
  useEffect(() => {
    window.addEventListener(INTERNET_RESTORED_EVENT, callback);
    return () => {
      window.removeEventListener(INTERNET_RESTORED_EVENT, callback);
    };
  }, [callback]);
}
