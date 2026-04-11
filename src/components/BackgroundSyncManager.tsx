"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { flushAuditSyncQueue, getPendingAuditSyncCount } from "@/lib/client/auditSyncQueue";
import { flushTemplateSyncQueue, getPendingTemplateSyncCount } from "@/lib/client/templateSyncQueue";
import {
  flushBackgroundMutationQueue,
  getPendingBackgroundMutationCount,
} from "@/lib/client/backgroundMutationQueue";

function readPendingCount() {
  return (
    getPendingAuditSyncCount() +
    getPendingTemplateSyncCount() +
    getPendingBackgroundMutationCount()
  );
}

export function BackgroundSyncManager() {
  const { session } = useAuth();
  const accessToken = session?.access_token || "";

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const refreshPending = () => setPendingCount(readPendingCount());

    updateOnline();
    refreshPending();

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    const poll = window.setInterval(refreshPending, 2500);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !online) return;

    let active = true;

    const flushAll = async () => {
      if (!active) return;
      setSyncing(true);
      try {
        await flushAuditSyncQueue(accessToken);
        await flushTemplateSyncQueue(accessToken);
        await flushBackgroundMutationQueue(accessToken);
      } finally {
        if (!active) return;
        setSyncing(false);
        setPendingCount(readPendingCount());
      }
    };

    const maybeFlush = () => {
      if (readPendingCount() > 0) {
        flushAll().catch(() => {
          if (!active) return;
          setSyncing(false);
        });
      } else {
        setPendingCount(0);
      }
    };

    maybeFlush();

    const onOnline = () => maybeFlush();
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeFlush();
    };
    const onFocus = () => maybeFlush();
    const interval = window.setInterval(maybeFlush, 8000);

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [accessToken, online]);

  const label = useMemo(() => {
    if (!online) return "Offline mode";
    if (syncing) return "Syncing updates...";
    if (pendingCount > 0) return `${pendingCount} update${pendingCount === 1 ? "" : "s"} pending`;
    return "Up to date";
  }, [online, syncing, pendingCount]);

  const toneClass = !online
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : pendingCount > 0 || syncing
      ? "border-blue-300 bg-blue-50 text-blue-900"
      : "border-foreground/20 bg-background text-foreground/70";

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${toneClass}`}>
      {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{label}</span>
    </div>
  );
}
