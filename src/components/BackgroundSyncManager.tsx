"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  AUDIT_OUTBOX_CHANGED_EVENT,
  flushAuditSyncQueue,
  getPendingAuditSyncCountAsync,
  notifyAuditOutboxChanged,
} from "@/lib/client/auditSyncQueue";
import { flushTemplateSyncQueue, getPendingTemplateSyncCount } from "@/lib/client/templateSyncQueue";
import {
  flushBackgroundMutationQueue,
  getPendingBackgroundMutationCount,
} from "@/lib/client/backgroundMutationQueue";
import { mergeAuditsRows, type CachedAuditRow, readAuditsListCache, writeAuditsListCache } from "@/lib/client/auditsListCache";
import { isAppOffline, OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/appOffline";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import {
  readWorkspaceCache,
  workspaceContentFingerprint,
  writeWorkspaceCache,
  type WorkspaceData,
} from "@/lib/client/workspaceCache";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";

async function readPendingCountAsync() {
  const auditPending = await getPendingAuditSyncCountAsync();
  return auditPending + getPendingTemplateSyncCount() + getPendingBackgroundMutationCount();
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
  const categoryId = searchParams.get("categoryId");

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const updateOnline = () => setOnline(!isAppOffline());
    const refreshPending = () => {
      void readPendingCountAsync().then((count) => {
        if (!cancelled) setPendingCount(count);
      });
    };

    updateOnline();
    refreshPending();

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, updateOnline);
    window.addEventListener(AUDIT_OUTBOX_CHANGED_EVENT, refreshPending);

    const poll = window.setInterval(refreshPending, 8_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, updateOnline);
      window.removeEventListener(AUDIT_OUTBOX_CHANGED_EVENT, refreshPending);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
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
        const userId = user?.id || null;
        const previous =
          readWorkspaceCache(userId, tenantSlug, categoryId) ??
          readWorkspaceCache(userId, tenantSlug, null);
        const previousFp = previous ? workspaceContentFingerprint(previous) : "";

        const wsUrl = new URL(apiUrl("/api/workspace"));
        wsUrl.searchParams.set("tenantSlug", tenantSlug);
        if (categoryId) wsUrl.searchParams.set("categoryId", categoryId);
        const workspace = await fetchJson<WorkspaceData>(wsUrl.toString());

        writeWorkspaceCache(userId, tenantSlug, null, workspace, { silent: true });
        if (workspace.selectedCategoryId) {
          writeWorkspaceCache(userId, tenantSlug, workspace.selectedCategoryId, workspace, {
            silent: true,
          });
        }
        if (categoryId) {
          writeWorkspaceCache(userId, tenantSlug, categoryId, workspace, { silent: true });
        }

        const nextFp = workspaceContentFingerprint(workspace);
        const changed = !previousFp || previousFp !== nextFp;

        // Notify UI: soft event for listeners + force refetch when remote data changed.
        window.dispatchEvent(
          new CustomEvent("workspace-cache-updated", {
            detail: { tenantSlug, categoryId: categoryId || workspace.selectedCategoryId || null },
          })
        );
        if (changed) {
          requestWorkspaceRevalidate(tenantSlug);
        }

        const existingAudits = readAuditsListCache(userId, tenantSlug);
        const auditsUrl = new URL(apiUrl("/api/audit/list"));
        auditsUrl.searchParams.set("tenantSlug", tenantSlug);
        if (existingAudits?.maxUpdatedAt) {
          auditsUrl.searchParams.set("since", existingAudits.maxUpdatedAt);
        }

        const auditsJson = await fetchJson<{ rows?: CachedAuditRow[]; maxUpdatedAt?: string | null }>(
          auditsUrl.toString()
        );
        if (Array.isArray(auditsJson.rows) && auditsJson.rows.length > 0) {
          const merged = existingAudits
            ? mergeAuditsRows(existingAudits.rows, auditsJson.rows)
            : auditsJson.rows;
          writeAuditsListCache(userId, tenantSlug, merged, auditsJson.maxUpdatedAt || null);
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
        // Always flush audit outbox when online — do not gate on localStorage-only counts.
        await flushAuditSyncQueue(accessToken);
        await flushTemplateSyncQueue(accessToken);
        await flushBackgroundMutationQueue(accessToken);
        await runPullSync();
      } finally {
        if (!active) return;
        setSyncing(false);
        const count = await readPendingCountAsync();
        if (active) setPendingCount(count);
        notifyAuditOutboxChanged();
      }
    };

    const maybeFlush = () => {
      flushAll().catch(() => {
        if (!active) return;
        setSyncing(false);
      });
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
    // Pull often enough that other devices' forms/categories appear without re-login.
    const pullInterval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      runPullSync().catch(() => {
        // ignore
      });
    }, 30_000);
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
  }, [accessToken, online, tenantSlug, categoryId, user?.id]);

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

  // Keep the chip native-only to avoid cluttering desktop chrome; sync still runs above on web.
  if (!isCapacitorNativeApp()) {
    return null;
  }

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
