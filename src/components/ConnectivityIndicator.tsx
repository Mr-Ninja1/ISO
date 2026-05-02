"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useAppOffline } from "@/lib/client/useAppOffline";

export function ConnectivityIndicator() {
  const offline = useAppOffline();
  const online = !offline;

  const Icon = online ? Wifi : WifiOff;

  return (
    <div
      className="inline-flex items-center gap-2 text-sm text-foreground/70"
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
    >
      <Icon className={online ? "h-5 w-5" : "h-5 w-5 opacity-50"} />
      <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
    </div>
  );
}
