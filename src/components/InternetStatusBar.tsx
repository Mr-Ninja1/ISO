"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, WifiOff, X } from "lucide-react";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { INTERNET_RESTORED_EVENT } from "@/lib/client/appOffline";

const OFFLINE_AUTO_HIDE_MS = 7000;
const RESTORED_VISIBLE_MS = 4000;

export function InternetStatusBar() {
  const offline = useAppOffline();
  const [showRestored, setShowRestored] = useState(false);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const offlineSessionRef = useRef(0);

  useEffect(() => {
    let restoredTimer: number | undefined;

    const handleRestored = () => {
      setShowRestored(true);
      setOfflineVisible(false);
      setOfflineDismissed(false);
      if (restoredTimer) window.clearTimeout(restoredTimer);
      restoredTimer = window.setTimeout(() => setShowRestored(false), RESTORED_VISIBLE_MS);
    };

    window.addEventListener(INTERNET_RESTORED_EVENT, handleRestored);
    return () => {
      window.removeEventListener(INTERNET_RESTORED_EVENT, handleRestored);
      if (restoredTimer) window.clearTimeout(restoredTimer);
    };
  }, []);

  useEffect(() => {
    if (!offline) {
      setOfflineVisible(false);
      setOfflineDismissed(false);
      return;
    }

    offlineSessionRef.current += 1;
    const session = offlineSessionRef.current;
    setOfflineDismissed(false);
    setOfflineVisible(true);

    const hideTimer = window.setTimeout(() => {
      if (offlineSessionRef.current === session) setOfflineVisible(false);
    }, OFFLINE_AUTO_HIDE_MS);

    return () => window.clearTimeout(hideTimer);
  }, [offline]);

  function dismissOffline() {
    setOfflineDismissed(true);
    setOfflineVisible(false);
  }

  if (showRestored) {
    return (
      <div
        role="status"
        className="internet-status-toast internet-status-toast--restored"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>Internet restored. Syncing…</span>
      </div>
    );
  }

  if (offline && offlineVisible && !offlineDismissed) {
    return (
      <div role="status" className="internet-status-toast internet-status-toast--offline">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">No internet. Working offline.</span>
        <button
          type="button"
          onClick={dismissOffline}
          className="internet-status-toast__close"
          aria-label="Dismiss offline notice"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return null;
}
