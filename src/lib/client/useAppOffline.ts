"use client";

import { useCallback, useEffect, useState } from "react";
import { isAppOffline, isNativeApp, OFFLINE_MODE_CHANGED_EVENT, INTERNET_RESTORED_EVENT, initInternetStatusMonitor } from "./appOffline";

/** Reactive offline state (browser + `window.__ISO_FORCE_OFFLINE__` from mobile shell). */
export function useAppOffline(): boolean {
  const [offline, setOffline] = useState(() =>
    typeof window !== "undefined" ? isAppOffline() : false
  );

  useEffect(() => {
    const sync = () => setOffline(isAppOffline());

    sync();
    const unsubscribe = initInternetStatusMonitor();
    
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);

    return () => {
      unsubscribe();
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, sync);
    };
  }, []);

  return offline;
}

/** Check if page should be restricted to web-only (not available in native app). */
export function useWebOnlyPage(shouldBlock?: boolean): boolean {
  const isNative = useAppOffline(); // Will be false if native, true if web
  return isNativeApp() && (shouldBlock !== false);
}

/** Trigger callback when internet is restored after being offline. */
export function useOnInternetRestored(callback: () => void) {
  const memoCallback = useCallback(callback, [callback]);

  useEffect(() => {
    window.addEventListener(INTERNET_RESTORED_EVENT, () => memoCallback());
    return () => {
      window.removeEventListener(INTERNET_RESTORED_EVENT, () => memoCallback());
    };
  }, [memoCallback]);
}
