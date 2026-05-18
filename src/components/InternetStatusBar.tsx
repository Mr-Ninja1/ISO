"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { INTERNET_RESTORED_EVENT } from "@/lib/client/appOffline";

export function InternetStatusBar() {
  const offline = useAppOffline();
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleRestored = () => {
      setShowRestored(true);
      const timer = window.setTimeout(() => setShowRestored(false), 4000);
      return () => window.clearTimeout(timer);
    };

    window.addEventListener(INTERNET_RESTORED_EVENT, handleRestored);
    return () => {
      window.removeEventListener(INTERNET_RESTORED_EVENT, handleRestored);
    };
  }, []);

  if (showRestored) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-emerald-50 border-b border-emerald-300 px-4 py-2 flex items-center gap-2 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>Internet restored. Syncing your changes...</span>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center gap-2 text-sm text-amber-900">
        <WifiOff className="h-4 w-4 flex-shrink-0" />
        <span>No internet connection. Working offline.</span>
      </div>
    );
  }

  return null;
}
