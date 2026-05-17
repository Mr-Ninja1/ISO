"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const MIN_VISIBLE_MS = 1600;
const SPLASH_SEEN_KEY = "iso-native-splash-seen:v1";

export function NativeLaunchSplash() {
  const { loading: authLoading } = useAuth();
  const [minVisibleElapsed, setMinVisibleElapsed] = useState(false);
  const [coldStart] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem(SPLASH_SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinVisibleElapsed(true);
    }, MIN_VISIBLE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!coldStart) return;
    if (authLoading || !minVisibleElapsed) return;
    try {
      sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, [coldStart, authLoading, minVisibleElapsed]);

  if (!coldStart) return null;

  const visible = authLoading || !minVisibleElapsed;

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#08111f] px-6 text-slate-50">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <div className="h-36 w-36 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_24px_90px_rgba(2,6,23,0.42)]">
          <img src="/icon-192.png" alt="ISO Pro logo" className="h-full w-full object-cover" />
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">ISO Pro</h1>
          <p className="text-sm text-slate-200/75">Launching secure workspace...</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" />
        </div>
        <p className="text-xs text-slate-200/55">Preparing login and cached workspace state</p>
      </div>
    </div>
  );
}
