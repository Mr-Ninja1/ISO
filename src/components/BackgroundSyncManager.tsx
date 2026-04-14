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
import { readCachedActivityRows, writeCachedActivityRows, type CachedActivityRow } from "@/lib/client/activityCache";
import { writeAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import { mergeAuditsRows, type CachedAuditRow, readAuditsListCache, writeAuditsListCache } from "@/lib/client/auditsListCache";

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

type TemplatesCacheResponse = {
  tenant?: { slug: string; name: string; logoUrl: string | null };
  templates?: Array<{ id: string; title: string; schema: any; updatedAt: string }>;
};

type ActivityResponse = {
  rows?: CachedActivityRow[];
};

type CategorySummary = { id: string };

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
  if (fallback) return fallback;
  const current = pathname || "";
  const parts = current.split("/").filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0];
  const reserved = new Set(["workspace", "dashboard", "login", "signup", "onboarding", "offline"]);
  if (reserved.has(first)) return "";
  return first;
}

function bootstrapKey(userId: string | null, tenantSlug: string) {
  return `offline-bootstrap:v1:${userId || "anon"}:${tenantSlug}`;
}

function readBootstrapTs(userId: string | null, tenantSlug: string) {
  try {
    const raw = localStorage.getItem(bootstrapKey(userId, tenantSlug));
    if (!raw) return 0;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function markBootstrapDone(userId: string | null, tenantSlug: string) {
  try {
    localStorage.setItem(bootstrapKey(userId, tenantSlug), String(Date.now()));
  } catch {
    // ignore
  }
}

export function BackgroundSyncManager() {
  const { session, user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = session?.access_token || "";
  const tenantSlug = tenantSlugFromPath(pathname, searchParams.get("tenantSlug"));

  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [bootstrapRunning, setBootstrapRunning] = useState(false);
  const [bootstrapStage, setBootstrapStage] = useState("");
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
    let pullRunning = false;

    async function fetchJson<T>(url: string) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
      return data as T;
    }

    function preloadCategoryViews(workspace: WorkspaceData) {
      if (!tenantSlug || !active) return;
      if (!workspace.categories.length) return;

      const categoryIds = workspace.categories.map((category: CategorySummary) => category.id);
      if (!categoryIds.length) return;

      void Promise.allSettled(
        categoryIds.map(async (categoryId) => {
          const categoryUrl = new URL("/api/workspace", window.location.origin);
          categoryUrl.searchParams.set("tenantSlug", tenantSlug);
          categoryUrl.searchParams.set("categoryId", categoryId);
          try {
            const scoped = await fetchJson<WorkspaceData>(categoryUrl.toString());
            writeWorkspaceCache(user?.id || null, tenantSlug, categoryId, scoped);
          } catch {
            // best-effort background preload
          }
        })
      );
    }

    const runBootstrapWarmup = async () => {
      if (!tenantSlug || !active) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const lastBootstrap = readBootstrapTs(user?.id || null, tenantSlug);
      const shouldBootstrap = Date.now() - lastBootstrap > 24 * 60 * 60 * 1000;
      if (!shouldBootstrap) return;

      setBootstrapRunning(true);
      try {
        setBootstrapStage("Loading workspace");
        const wsUrl = new URL("/api/workspace", window.location.origin);
        wsUrl.searchParams.set("tenantSlug", tenantSlug);
        const workspace = await fetchJson<WorkspaceData>(wsUrl.toString());
        writeWorkspaceCache(user?.id || null, tenantSlug, null, workspace);
        if (workspace.selectedCategoryId) {
          writeWorkspaceCache(user?.id || null, tenantSlug, workspace.selectedCategoryId, workspace);
        }

        setBootstrapStage("Preloading category views");
        preloadCategoryViews(workspace);

        setBootstrapStage("Loading templates and schemas");
        const templatesUrl = new URL("/api/audit/templates-cache", window.location.origin);
        templatesUrl.searchParams.set("tenantSlug", tenantSlug);
        const templatesJson = await fetchJson<TemplatesCacheResponse>(templatesUrl.toString());
        if (templatesJson.tenant && Array.isArray(templatesJson.templates)) {
          for (const t of templatesJson.templates) {
            writeAuditTemplateCache(tenantSlug, t.id, {
              tenant: templatesJson.tenant,
              template: {
                id: t.id,
                title: t.title,
                schema: t.schema,
                updatedAt: t.updatedAt,
              },
            });
          }
        }

        setBootstrapStage("Loading saved forms");
        const auditsUrl = new URL("/api/audit/list", window.location.origin);
        auditsUrl.searchParams.set("tenantSlug", tenantSlug);
        const auditsJson = await fetchJson<{ rows?: CachedAuditRow[]; maxUpdatedAt?: string | null }>(auditsUrl.toString());
        if (Array.isArray(auditsJson.rows)) {
          writeAuditsListCache(user?.id || null, tenantSlug, auditsJson.rows, auditsJson.maxUpdatedAt || null);
        }

        setBootstrapStage("Loading activity");
        const role = workspace.role || (workspace.capabilities?.canAccessSettings ? "ADMIN" : "MEMBER");
        if (role === "ADMIN" || role === "MANAGER") {
          try {
            const activityUrl = new URL("/api/activity", window.location.origin);
            activityUrl.searchParams.set("tenantSlug", tenantSlug);
            activityUrl.searchParams.set("limit", "200");
            const activityJson = await fetchJson<ActivityResponse>(activityUrl.toString());
            if (Array.isArray(activityJson.rows)) {
              writeCachedActivityRows(tenantSlug, activityJson.rows);
            }
          } catch {
            // optional for non-admin / no access
          }
        }

        markBootstrapDone(user?.id || null, tenantSlug);
      } catch {
        // best-effort
      } finally {
        setBootstrapStage("");
        setBootstrapRunning(false);
      }
    };

    const runPullSync = async () => {
      if (!tenantSlug || pullRunning || !active) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      pullRunning = true;
      try {
        const wsUrl = new URL("/api/workspace", window.location.origin);
        wsUrl.searchParams.set("tenantSlug", tenantSlug);
        const workspace = await fetchJson<WorkspaceData>(wsUrl.toString());
        writeWorkspaceCache(user?.id || null, tenantSlug, null, workspace);
        if (workspace.selectedCategoryId) {
          writeWorkspaceCache(user?.id || null, tenantSlug, workspace.selectedCategoryId, workspace);
        }

        preloadCategoryViews(workspace);

        const templatesUrl = new URL("/api/audit/templates-cache", window.location.origin);
        templatesUrl.searchParams.set("tenantSlug", tenantSlug);
        const templatesJson = await fetchJson<{
          tenant?: { slug: string; name: string; logoUrl: string | null };
          templates?: Array<{ id: string; title: string; schema: any; updatedAt: string }>;
        }>(templatesUrl.toString());

        if (templatesJson.tenant && Array.isArray(templatesJson.templates)) {
          for (const t of templatesJson.templates) {
            writeAuditTemplateCache(tenantSlug, t.id, {
              tenant: templatesJson.tenant,
              template: {
                id: t.id,
                title: t.title,
                schema: t.schema,
                updatedAt: t.updatedAt,
              },
            });
          }
        }

        const existingAudits = readAuditsListCache(user?.id || null, tenantSlug);
        const auditsUrl = new URL("/api/audit/list", window.location.origin);
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
    runBootstrapWarmup().catch(() => {
      // ignore initial bootstrap failures
    });

    const onOnline = () => maybeFlush();
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
    const interval = window.setInterval(maybeFlush, 8000);
    const pullInterval = window.setInterval(() => {
      runPullSync().catch(() => {
        // ignore
      });
    }, 45_000);
    const bootstrapInterval = window.setInterval(() => {
      runBootstrapWarmup().catch(() => {
        // ignore
      });
    }, 6 * 60_000);

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
      window.clearInterval(bootstrapInterval);
    };
  }, [accessToken, online, tenantSlug, user?.id]);

  const label = useMemo(() => {
    if (bootstrapRunning) return bootstrapStage ? `Preparing offline cache: ${bootstrapStage}` : "Preparing offline cache...";
    if (!online) return "Offline mode";
    if (syncing) return "Syncing updates...";
    if (pendingCount > 0) return `${pendingCount} update${pendingCount === 1 ? "" : "s"} pending`;
    return "Up to date";
  }, [online, syncing, pendingCount, bootstrapRunning, bootstrapStage]);

  const toneClass = !online
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : bootstrapRunning || pendingCount > 0 || syncing
      ? "border-blue-300 bg-blue-50 text-blue-900"
      : "border-foreground/20 bg-background text-foreground/70";

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${toneClass}`}>
      {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{label}</span>
    </div>
  );
}
