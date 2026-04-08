"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function ConnectivityIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

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
