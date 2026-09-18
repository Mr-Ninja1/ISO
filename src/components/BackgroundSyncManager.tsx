"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { flushAuditSyncQueue, getPendingAuditSyncCount } from "@/lib/client/auditSyncQueue";
import { flushTemplateSyncQueue, getPendingTemplateSyncCount } from "@/lib/client/templateSyncQueue";
import {
  flushBackgroundMutationQueue,
  getPendingBackgroundMutationCount,
} from "@/lib/client/backgroundMutationQueue";
import { mergeAuditsRows, type CachedAuditRow, readAuditsListCache, writeAuditsListCache } from "@/lib/client/auditsListCache";
import { isAppOffline, OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/appOffline";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

function readPendingCount() {
  return (
    getPendingAuditSyncCount() +
    getPendingTemplateSyncCount() +
    getPendingBackgroundMutationCount()
  );
}

type WorkspaceData = {
  tenant: { slug: string };
  categories: Array<{ id: string }>;
  selectedCategoryId: string | null;
  role?: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities?: {
    canAccessSettings?: boolean;
    canCreateForms?: boolean;
    canManageCategories?: boolean;
    canManageStaff?: boolean;
  };
};

function workspaceCacheKey(userId: string | null, tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:${categoryId || "all"}`;
}

function writeWorkspaceCache(userId: string | null, tenantSlug: string, categoryId: string | null, data: WorkspaceData) {
  try {
    localStorage.setItem(
      workspaceCacheKey(userId, tenantSlug, categoryId),
      JSON.stringify({ ts: Date.now(), data })
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("workspace-cache-updated", {
          detail: { tenantSlug, categoryId },
        })
      );
    }
  } catch {
    // ignore cache write failures
  }
}

function tenantSlugFromPath(pathname: string | null, fallback: string | null): string {
  const normalizedFallback = fallback && fallback !== "_" && fallback !== "workspace" ? fallback : "";
  if (normalizedFallback) return normalizedFallback;
  const current = pathname || "";
  const parts = current.split("/").filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const reserved = new Set(["workspace", "dashboard", "login", "signup", "onboarding", "offline", "_"]);
  if (reserved.has(first)) return "";
  return /^[a-z0-9][a-z0-9-]*$/i.test(first) ? first : "";
}

export function BackgroundSyncManager() {
  const { session, user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = session?.access_token || "";
  const tenantSlug = tenantSlugFromPath(pathname, searchParams.get("tenantSlug"));

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    const updateOnline = () => setOnline(!isAppOffline());
    const refreshPending = () => setPendingCount(readPendingCount());

    updateOnline();
    refreshPending();

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, updateOnline);

    const poll = window.setInterval(refreshPending, 8_000);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, updateOnline);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;
    if (!accessToken || !online) return;

    let active = true;
    let pullRunning = false;

    async function fetchJson<T>(url: string) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
      return data as T;
    }

    const runPullSync = async () => {
      if (!tenantSlug || pullRunning || !active) return;
      if (isAppOffline()) return;

      pullRunning = true;
      try {
        const wsUrl = new URL(apiUrl("/api/workspace"));
        wsUrl.searchParams.set("tenantSlug", tenantSlug);
        const workspace = await fetchJson<WorkspaceData>(wsUrl.toString());
        writeWorkspaceCache(user?.id || null, tenantSlug, null, workspace);
        if (workspace.selectedCategoryId) {
          writeWorkspaceCache(user?.id || null, tenantSlug, workspace.selectedCategoryId, workspace);
        }

        const existingAudits = readAuditsListCache(user?.id || null, tenantSlug);
        const auditsUrl = new URL(apiUrl("/api/audit/list"));
        auditsUrl.searchParams.set("tenantSlug", tenantSlug);
        if (existingAudits?.maxUpdatedAt) {
          auditsUrl.searchParams.set("since", existingAudits.maxUpdatedAt);
        }

        const auditsJson = await fetchJson<{ rows?: CachedAuditRow[]; maxUpdatedAt?: string | null }>(auditsUrl.toString());
        if (Array.isArray(auditsJson.rows) && auditsJson.rows.length > 0) {
          const merged = existingAudits
            ? mergeAuditsRows(existingAudits.rows, auditsJson.rows)
            : auditsJson.rows;
          writeAuditsListCache(user?.id || null, tenantSlug, merged, auditsJson.maxUpdatedAt || null);
        }
      } catch {
        // best-effort background pull sync
      } finally {
        pullRunning = false;
      }
    };

    const flushAll = async () => {
      if (!active) return;
      setSyncing(true);
      try {
        await flushAuditSyncQueue(accessToken);
        await flushTemplateSyncQueue(accessToken);
        await flushBackgroundMutationQueue(accessToken);
        await runPullSync();
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
    runPullSync().catch(() => {
      // ignore initial pull sync failures
    });
    const onOnline = () => {
      maybeFlush();
      runPullSync().catch(() => {
        // ignore reconnect sync failures
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeFlush();
        runPullSync().catch(() => {
          // ignore
        });
      }
    };
    const onFocus = () => {
      maybeFlush();
      runPullSync().catch(() => {
        // ignore
      });
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      maybeFlush();
    }, 15_000);
    const pullInterval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      runPullSync().catch(() => {
        // ignore
      });
    }, 90_000);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      window.clearInterval(pullInterval);
    };
  }, [accessToken, online, tenantSlug, user?.id]);

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

  if (pathname?.includes("/templates/new")) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${toneClass}`}>
      {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{label}</span>
    </div>
  );
}
