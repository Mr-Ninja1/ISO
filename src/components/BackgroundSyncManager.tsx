"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  shouldPauseBackgroundWork,
  waitForInteractiveNavClear,
} from "@/lib/client/interactionGate";
import { isOfflineBootstrapComplete } from "@/lib/client/offlineBootstrap";
import { isTenantTemplateBulkCached } from "@/lib/client/offlineTemplateWarmup";
import { fetchAndCacheAuditsList } from "@/lib/client/auditsListSync";

const REMOTE_CHANGE_CHECK_INTERVAL_MS = 5 * 60_000;
const AUDITS_PULL_INTERVAL_MS = 2 * 60_000;
const RECONNECT_SETTLE_DELAY_MS = 8_000;
/** Faster settle when the outbox just grew — user expects Pending sync to clear soon. */
const OUTBOX_FLUSH_SETTLE_MS = 1_200;
const FLUSH_INTERVAL_MS = 45_000;

async function readPendingCountAsync() {
  const auditPending = await getPendingAuditSyncCountAsync();
  return auditPending + getPendingTemplateSyncCount() + getPendingBackgroundMutationCount();
}

function workspaceChangeSignatureKey(tenantSlug: string) {
  return `workspace-change-signature:v1:${tenantSlug}`;
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
  // Ref so category tab changes don't tear down intervals / restart pull storms.
  const categoryIdRef = useRef(categoryId);
  categoryIdRef.current = categoryId;
  const tenantSlugRef = useRef(tenantSlug);
  tenantSlugRef.current = tenantSlug;
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const userIdRef = useRef(user?.id || null);
  userIdRef.current = user?.id || null;

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

    const isOfflineAuditUtilityPath = /\/audits\/(?:local|offline-last)(?:\/|$)/.test(pathname || "");
    const isAuditDetailPath =
      !isOfflineAuditUtilityPath && /\/audits\/[^/]+(?:\/|$)/.test(pathname || "");

    let active = true;
    let pullRunning = false;
    const pullController = new AbortController();
    let flushController: AbortController | null = null;
    let lastRemoteCheckAt = 0;
    let lastAuditsPullAt = 0;
    let reconnectTimer: number | null = null;
    let outboxFlushTimer: number | null = null;

    async function fetchJson<T>(url: string) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: pullController.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : `Request failed (${res.status})`;
        throw new Error(errorMessage);
      }
      return data as T;
    }

    const checkRemoteChanges = async (force = false) => {
      // Heavy workspace change probes stay off audit detail screens.
      if (isAuditDetailPath) return;
      const slug = tenantSlugRef.current;
      const userId = userIdRef.current;
      if (!slug || !active || isAppOffline()) return;
      if (!force && Date.now() - lastRemoteCheckAt < REMOTE_CHANGE_CHECK_INTERVAL_MS) return;
      if (!isOfflineBootstrapComplete(userId, slug) || !isTenantTemplateBulkCached(slug)) return;

      lastRemoteCheckAt = Date.now();
      try {
        const changesUrl = new URL(apiUrl("/api/workspace/changes"));
        changesUrl.searchParams.set("tenantSlug", slug);
        const changeState = await fetchJson<{ signature?: string }>(changesUrl.toString());
        const nextSignature = changeState.signature || "";
        if (!nextSignature || !active) return;

        const storageKey = workspaceChangeSignatureKey(slug);
        const previousSignature = localStorage.getItem(storageKey);
        if (previousSignature && previousSignature !== nextSignature) {
          window.dispatchEvent(
            new CustomEvent("workspace-updates-available", {
              detail: { tenantSlug: slug },
            })
          );
        }
        localStorage.setItem(storageKey, nextSignature);
      } catch {
        // Remote checks are advisory; local cached work remains available.
      }
    };

    const pullAuditsList = async (force = false) => {
      const slug = tenantSlugRef.current;
      if (!slug || !active || isAppOffline()) return;
      if (!force && Date.now() - lastAuditsPullAt < AUDITS_PULL_INTERVAL_MS) return;
      if (shouldPauseBackgroundWork()) {
        await waitForInteractiveNavClear(2500);
        if (!active || shouldPauseBackgroundWork()) return;
      }

      lastAuditsPullAt = Date.now();
      try {
        await fetchAndCacheAuditsList(accessToken, userIdRef.current, slug, {
          limit: 50,
          offset: 0,
          status: "SUBMITTED",
          merge: true,
        });
      } catch {
        // best-effort; AuditsListClient also pulls on mount
      }
    };

    const runPullSync = async () => {
      const slug = tenantSlugRef.current;
      const catId = categoryIdRef.current;
      if (!slug || pullRunning || !active) return;
      if (isAppOffline()) return;
      if (isAuditDetailPath) {
        // On report screens only refresh the submitted-forms cache — skip workspace storms.
        await pullAuditsList(true);
        return;
      }
      if (shouldPauseBackgroundWork()) {
        await waitForInteractiveNavClear(2500);
        if (!active || shouldPauseBackgroundWork()) return;
      }

      pullRunning = true;
      try {
        const userId = userIdRef.current;
        const previous =
          readWorkspaceCache(userId, slug, catId) ?? readWorkspaceCache(userId, slug, null);
        const previousFp = previous ? workspaceContentFingerprint(previous) : "";

        const preparedWorkspace =
          Boolean(previous) &&
          isOfflineBootstrapComplete(userId, slug) &&
          isTenantTemplateBulkCached(slug);
        if (!preparedWorkspace) {
          const wsUrl = new URL(apiUrl("/api/workspace"));
          wsUrl.searchParams.set("tenantSlug", slug);
          if (catId) wsUrl.searchParams.set("categoryId", catId);
          const workspace = await fetchJson<WorkspaceData>(wsUrl.toString());
          if (!active) return;
          if (shouldPauseBackgroundWork()) return;

          writeWorkspaceCache(userId, slug, null, workspace, { silent: true });
          if (workspace.selectedCategoryId) {
            writeWorkspaceCache(userId, slug, workspace.selectedCategoryId, workspace, {
              silent: true,
            });
          }
          if (catId) {
            writeWorkspaceCache(userId, slug, catId, workspace, { silent: true });
          }

          const nextFp = workspaceContentFingerprint(workspace);
          const changed = !previousFp || previousFp !== nextFp;

          // Only notify UI when remote data actually changed — unconditional broadcasts
          // were freezing form opens (setWorkspace → effect cascades on every 30s pull).
          if (changed && active && !shouldPauseBackgroundWork()) {
            window.dispatchEvent(
              new CustomEvent("workspace-cache-updated", {
                detail: { tenantSlug: slug, categoryId: catId || workspace.selectedCategoryId || null },
              })
            );
            requestWorkspaceRevalidate(slug);
          }
        }

        if (preparedWorkspace) {
          const changesUrl = new URL(apiUrl("/api/workspace/changes"));
          changesUrl.searchParams.set("tenantSlug", slug);
          const changeState = await fetchJson<{ signature?: string }>(changesUrl.toString());
          const nextSignature = changeState.signature || "";
          if (nextSignature) {
            const storageKey = workspaceChangeSignatureKey(slug);
            const previousSignature = localStorage.getItem(storageKey);
            if (previousSignature && previousSignature !== nextSignature) {
              window.dispatchEvent(
                new CustomEvent("workspace-updates-available", {
                  detail: { tenantSlug: slug },
                })
              );
            }
            localStorage.setItem(storageKey, nextSignature);
          }
        }

        if (!active || shouldPauseBackgroundWork()) return;
        await pullAuditsList(true);
      } catch {
        // best-effort background pull sync
      } finally {
        pullRunning = false;
      }
    };

    const flushAll = async () => {
      if (!active) return;
      if (shouldPauseBackgroundWork()) {
        await waitForInteractiveNavClear(4500);
        if (!active || shouldPauseBackgroundWork()) return;
      }
      if (!active || isAppOffline()) return;
      const queuedCount = await readPendingCountAsync();
      if (!active || isAppOffline()) return;
      if (queuedCount === 0) {
        setPendingCount(0);
        return;
      }
      setPendingCount(queuedCount);

      const controller = new AbortController();
      flushController = controller;
      setSyncing(true);
      try {
        // Always flush audit outbox when online — do not gate on localStorage-only counts.
        await flushAuditSyncQueue(accessToken, controller.signal, userIdRef.current);
        if (!active || controller.signal.aborted) return;
        await flushTemplateSyncQueue(accessToken, controller.signal);
        if (!active || controller.signal.aborted) return;
        await flushBackgroundMutationQueue(accessToken, controller.signal);
      } finally {
        if (flushController === controller) flushController = null;
        if (!active) return;
        setSyncing(false);
        const count = await readPendingCountAsync();
        if (active) setPendingCount(count);
        notifyAuditOutboxChanged();
      }
    };

    const maybeFlush = () => {
      if (flushInFlightRef.current) return;
      const request = flushAll().catch(() => {
        if (!active) return;
        setSyncing(false);
      });
      const tracked = request.finally(() => {
        if (flushInFlightRef.current === tracked) flushInFlightRef.current = null;
      });
      flushInFlightRef.current = tracked;
    };

    const scheduleFlushSoon = (delayMs: number) => {
      if (outboxFlushTimer !== null) window.clearTimeout(outboxFlushTimer);
      outboxFlushTimer = window.setTimeout(() => {
        outboxFlushTimer = null;
        if (!active) return;
        maybeFlush();
      }, delayMs);
    };

    // Initial flush after settle — never compete with first paint / first taps.
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (!active || shouldPauseBackgroundWork()) return;
      maybeFlush();
      void checkRemoteChanges();
      void pullAuditsList();
    }, RECONNECT_SETTLE_DELAY_MS);

    const onOnline = () => {
      // Defer flush so reconnect radio work never fights the user's first taps.
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (shouldPauseBackgroundWork()) return;
        maybeFlush();
        void checkRemoteChanges(true);
        void pullAuditsList(true);
      }, RECONNECT_SETTLE_DELAY_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (shouldPauseBackgroundWork()) return;
      maybeFlush();
      void checkRemoteChanges();
      void pullAuditsList();
    };
    const onFocus = () => {
      if (shouldPauseBackgroundWork()) return;
      maybeFlush();
      void checkRemoteChanges();
      void pullAuditsList();
    };
    const onExplicitSync = () => {
      runPullSync().catch(() => {
        // ignore explicit refresh failures
      });
    };
    const onOutboxChanged = () => {
      // Push pending forms soon after enqueue — do not wait for the 45s interval.
      scheduleFlushSoon(OUTBOX_FLUSH_SETTLE_MS);
    };
    const onHardInterrupt = () => {
      // Only abort when offline or backgrounded — never on interactive nav (that killed submit sync).
      flushController?.abort();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHardInterrupt();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (shouldPauseBackgroundWork()) return;
      maybeFlush();
      void pullAuditsList();
    }, FLUSH_INTERVAL_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onHardInterrupt);
    window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, onHardInterrupt);
    window.addEventListener(AUDIT_OUTBOX_CHANGED_EVENT, onOutboxChanged);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("workspace-sync-requested", onExplicitSync);

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onHardInterrupt);
      window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, onHardInterrupt);
      window.removeEventListener(AUDIT_OUTBOX_CHANGED_EVENT, onOutboxChanged);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("workspace-sync-requested", onExplicitSync);
      window.clearInterval(interval);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (outboxFlushTimer !== null) window.clearTimeout(outboxFlushTimer);
      pullController.abort();
      // Do not abort flushController here — pathname changes (submit → audits list)
      // remount this effect and were cancelling in-flight outbox POSTs.
    };
  }, [accessToken, online, pathname, tenantSlug, user?.id]);

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
