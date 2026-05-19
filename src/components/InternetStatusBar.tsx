"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, WifiOff } from "lucide-react";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { INTERNET_RESTORED_EVENT } from "@/lib/client/appOffline";

export function InternetStatusBar() {
  const offline = useAppOffline();
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleRestored = () => {
      setShowRestored(true);
      window.setTimeout(() => setShowRestored(false), 4000);
    };

    window.addEventListener(INTERNET_RESTORED_EVENT, handleRestored);
    return () => {
      window.removeEventListener(INTERNET_RESTORED_EVENT, handleRestored);
    };
  }, []);

  if (showRestored) {
    return (
      <div
        role="status"
        className="fixed top-2 right-2 z-40 max-w-[min(calc(100vw-1rem),20rem)] rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 shadow-md flex items-center gap-2 text-sm text-emerald-900"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Internet restored. Syncing…</span>
      </div>
    );
  }

  if (offline) {
    return (
      <div
        role="status"
        className="fixed top-2 right-2 z-40 max-w-[min(calc(100vw-1rem),20rem)] rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 shadow-md flex items-center gap-2 text-sm text-amber-950"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>No internet. Working offline.</span>
      </div>
    );
  }

  return null;
}
