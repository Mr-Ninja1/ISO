"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useAppOffline } from "@/lib/client/useAppOffline";

/** Single connectivity status — green when online, red when offline (replaces separate “offline ready” pills). */
export function ConnectivityIndicator() {
  const offline = useAppOffline();
  const online = !offline;

  return (
    <div
      className={
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm " +
        (online
          ? "border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900"
          : "border-red-300/80 bg-gradient-to-r from-red-50 to-rose-50 text-red-900")
      }
      aria-label={online ? "Connected — online" : "No connection — offline"}
      title={online ? "Connected to the network" : "Working offline from device cache"}
    >
      <span
        className={
          "h-2 w-2 shrink-0 rounded-full " +
          (online ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]")
        }
        aria-hidden
      />
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
    </div>
  );
}
