"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, MoreVertical, Loader2, CheckSquare, Trash2, Search, CalendarDays } from "lucide-react";
import { FloatingActionMenu } from "@/components/workspace/FloatingActionMenu";
import { NotificationModal } from "@/components/NotificationModal";

import { StoredFormsShareMenu } from "@/components/forms/StoredFormsShareMenu";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  filterRowsToLivePending,
  mergeAuditsRows,
  mergeAuditsRowsDroppingStalePending,
  readAuditsListCache,
  writeAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";
import { fetchAndCacheAuditsList } from "@/lib/client/auditsListSync";
import {
  AUDIT_OUTBOX_CHANGED_EVENT,
  flushAuditSyncQueue,
  getLivePendingAuditIds,
  getPendingAuditSyncCountAsync,
  pruneStalePendingFromAuditsCache,
} from "@/lib/client/auditSyncQueue";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import {
  isDevicePendingAuditId,
  loadDeviceAuditsRows,
} from "@/lib/client/deviceAuditsRows";
import { auditReportHref } from "@/lib/client/tenantNavigation";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";
import { readAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { waitForInteractiveNavClear } from "@/lib/client/interactionGate";

function serverListTimeoutMs() {
  return isCapacitorNativeApp() ? 30_000 : 12_000;
}

function actionButtonClass(busy: boolean) {
  return (
    "inline-flex h-10 min-w-[7.5rem] items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm transition-all duration-150 " +
    (busy
      ? "cursor-wait border-foreground/30 bg-foreground/10 opacity-90 shadow-inner animate-pulse"
      : "hover:bg-foreground/5 active:scale-[0.98]")
  );
}

function SavedFormRowActions({
  tenantSlug,
  auditId,
  templateId,
  layout,
  canDelete,
  onDelete,
}: {
  tenantSlug: string;
  auditId: string;
  templateId?: string;
  layout: "row" | "menu";
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const prefetchedRef = useRef(false);

  const reportPath = auditReportHref(tenantSlug, auditId);

  useEffect(() => {
    if (!busy) return;
    const timeout = window.setTimeout(() => setBusy(false), 15_000);
    return () => window.clearTimeout(timeout);
  }, [busy]);

  function prefetchReport() {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    try {
      router.prefetch(reportPath);
    } catch {
      // ignore
    }
    if (templateId) {
      void readAuditTemplateCache(tenantSlug, templateId);
    }
    const token = getWorkspaceAccessToken(session);
    if (!token || auditId.startsWith("pending:")) return;
    const url = new URL(apiUrl("/api/audit/report"));
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("auditId", auditId);
    void fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }

  function openReport() {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    // Prefer silent open — list rows are already local; network report hydrate is soft.
    navigateWithFeedback(router, reportPath, "push", { silent: true });
  }

  const viewLabel = busy ? "Opening…" : "View report";

  if (layout === "menu") {
    return (
      <div className="relative">
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setOpen(!open)}
          disabled={busy}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5 disabled:opacity-60"
          aria-label="More options"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </button>
        <FloatingActionMenu
          open={open}
          anchorRef={menuBtnRef}
          onClose={() => setOpen(false)}
          menuWidthPx={192}
        >
          <button
            type="button"
            disabled={busy}
            onMouseEnter={prefetchReport}
            onFocus={prefetchReport}
            onTouchStart={prefetchReport}
            onClick={openReport}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {viewLabel}
          </button>
          {canDelete && onDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : null}
        </FloatingActionMenu>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <button
        type="button"
        disabled={busy}
        onMouseEnter={prefetchReport}
        onFocus={prefetchReport}
        onTouchStart={prefetchReport}
        onClick={openReport}
        className={actionButtonClass(busy)}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {viewLabel}
      </button>
      {canDelete && onDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className={
            "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60 " +
            (busy ? "cursor-wait opacity-90" : "")
          }
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      ) : null}
    </div>
  );
}

function onlySubmittedRows(rows: CachedAuditRow[]) {
  return rows.filter((r) => r.status === "SUBMITTED");
}

function rowSignature(row: CachedAuditRow) {
  return [
    row.id,
    row.status,
    row.templateId,
    row.createdAt,
    row.updatedAt,
    row.submittedAt || "",
    row.template.title,
  ].join("|");
}

function rowsAreEqual(left: CachedAuditRow[], right: CachedAuditRow[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (rowSignature(left[index]) !== rowSignature(right[index])) return false;
  }
  return true;
}

function savedDateKey(row: CachedAuditRow) {
  const raw = row.submittedAt || row.updatedAt;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSavedDateGroupLabel(dateKey: string) {
  if (dateKey === "unknown") return "Other dates";

  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const todayKey = savedDateKey({
    id: "",
    status: "SUBMITTED",
    templateId: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    submittedAt: now.toISOString(),
    template: { title: "" },
  });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = savedDateKey({
    id: "",
    status: "SUBMITTED",
    templateId: "",
    createdAt: yesterday.toISOString(),
    updatedAt: yesterday.toISOString(),
    submittedAt: yesterday.toISOString(),
    template: { title: "" },
  });

  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function groupRowsBySavedDate(rows: CachedAuditRow[]) {
  const byDate = new Map<string, CachedAuditRow[]>();
  for (const row of rows) {
    const key = savedDateKey(row);
    const bucket = byDate.get(key) || [];
    bucket.push(row);
    byDate.set(key, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, groupRows]) => ({
      dateKey,
      label: formatSavedDateGroupLabel(dateKey),
      rows: groupRows.sort(
        (a, b) =>
          +new Date(b.submittedAt || b.updatedAt) -
          +new Date(a.submittedAt || a.updatedAt),
      ),
    }));
}

export function AuditsListClient({
  tenantSlug,
  initialQuery,
  rows,
}: {
  tenantSlug: string;
  initialQuery: string;
  rows: CachedAuditRow[];
}) {
  const { session, user } = useAuth();
  const accessToken = getWorkspaceAccessToken(session);
  const offline = useAppOffline();
  const activeTenantSlug = useResolvedTenantSlug(tenantSlug);
  const [query, setQuery] = useState(initialQuery);
  const [allRows, setAllRows] = useState<CachedAuditRow[]>(() => {
    if (rows.length) return rows;
    if (typeof window === "undefined" || !tenantSlug) return rows;
    return readAuditsListCache(user?.id || null, tenantSlug)?.rows ?? rows;
  });
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [hasLoadedFromServer, setHasLoadedFromServer] = useState(false);
  const [nextServerOffset, setNextServerOffset] = useState(0);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canDeleteAudits, setCanDeleteAudits] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState("");

  useEffect(() => {
    if (!accessToken || !activeTenantSlug || offline) return;
    void fetch(
      apiUrl(`/api/workspace/capabilities?tenantSlug=${encodeURIComponent(activeTenantSlug)}`),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setCanDeleteAudits(Boolean(json?.capabilities?.canDeleteAudits));
      })
      .catch(() => {});
  }, [accessToken, activeTenantSlug, offline]);

  useEffect(() => {
    if (!activeTenantSlug) return;
    let cancelled = false;

    const refreshDeviceRows = async () => {
      await pruneStalePendingFromAuditsCache(user?.id || null, activeTenantSlug);
      if (cancelled) return;
      const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
      if (cached?.rows?.length) {
        const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
        if (cancelled) return;
        setAllRows((current) => {
          const merged = mergeAuditsRowsDroppingStalePending(
            filterRowsToLivePending(current, livePendingIds),
            filterRowsToLivePending(cached.rows, livePendingIds),
          );
          return rowsAreEqual(current, merged) ? current : merged;
        });
      }

      const deviceRows = await loadDeviceAuditsRows(user?.id || null, activeTenantSlug);
      if (cancelled) return;
      setDeviceReady(true);
      if (!deviceRows.length) {
        // Still drop any orphan pending rows from the painted list.
        const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
        if (cancelled) return;
        setAllRows((current) => {
          const next = filterRowsToLivePending(current, livePendingIds);
          return rowsAreEqual(current, next) ? current : next;
        });
        return;
      }
      const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
      if (cancelled) return;
      setAllRows((current) => {
        const merged = mergeAuditsRowsDroppingStalePending(
          filterRowsToLivePending(current, livePendingIds),
          deviceRows,
        );
        return rowsAreEqual(current, merged) ? current : merged;
      });
    };

    void refreshDeviceRows();
    window.addEventListener(AUDIT_OUTBOX_CHANGED_EVENT, refreshDeviceRows);
    return () => {
      cancelled = true;
      window.removeEventListener(AUDIT_OUTBOX_CHANGED_EVENT, refreshDeviceRows);
    };
  }, [activeTenantSlug, user?.id]);

  useEffect(() => {
    if (allRows.length === 0) return;
    if (!activeTenantSlug) return;
    let cancelled = false;
    void (async () => {
      const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
      if (cancelled) return;
      const pruned = onlySubmittedRows(filterRowsToLivePending(allRows, livePendingIds));
      const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
      if (cached?.rows && rowsAreEqual(cached.rows, pruned)) return;
      writeAuditsListCache(user?.id || null, activeTenantSlug, pruned, undefined, {
        broadcast: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [allRows, activeTenantSlug, user?.id]);

  useEffect(() => {
    const onCacheUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== activeTenantSlug) return;
      void (async () => {
        const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
        if (!cached?.rows?.length) return;
        const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
        setAllRows((current) => {
          const merged = mergeAuditsRowsDroppingStalePending(
            filterRowsToLivePending(current, livePendingIds),
            filterRowsToLivePending(cached.rows, livePendingIds),
          );
          return rowsAreEqual(current, merged) ? current : merged;
        });
      })();
    };

    window.addEventListener(
      "audits-cache-updated",
      onCacheUpdate as EventListener,
    );
    return () => {
      window.removeEventListener(
        "audits-cache-updated",
        onCacheUpdate as EventListener,
      );
    };
  }, [activeTenantSlug, user?.id]);

  /** Push any queued submits, then pull first page of server history. */
  useEffect(() => {
    if (!accessToken || !activeTenantSlug || offline) return;

    let cancelled = false;
    const timeoutMs = serverListTimeoutMs();
    const localCount = onlySubmittedRows(
      readAuditsListCache(user?.id || null, activeTenantSlug)?.rows ?? [],
    ).length;
    // Soft sync: only show "Loading…" when nothing local is painted yet.
    if (localCount === 0) setSyncing(true);
    setSyncError("");

    void (async () => {
      try {
        // Always attempt flush when opening the list — old stuck outbox items need this.
        const pending = await getPendingAuditSyncCountAsync();
        if (!cancelled && pending > 0) {
          await waitForInteractiveNavClear(3500);
          if (!cancelled && !offline) {
            await flushAuditSyncQueue(accessToken, undefined, user?.id || null).catch(() => {});
          }
        }
        if (!cancelled) {
          await pruneStalePendingFromAuditsCache(user?.id || null, activeTenantSlug);
        }

        const result = await Promise.race([
          fetchAndCacheAuditsList(
            accessToken,
            user?.id || null,
            activeTenantSlug,
            { limit: 50, offset: 0, status: "SUBMITTED", merge: true },
          ),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () =>
                reject(
                  new Error(
                    `The submitted-forms service did not respond within ${timeoutMs / 1000} seconds. Showing saved forms from this device.`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);
        if (cancelled) return;
        await pruneStalePendingFromAuditsCache(user?.id || null, activeTenantSlug);
        if (cancelled) return;
        const livePendingIds = await getLivePendingAuditIds(activeTenantSlug);
        if (cancelled) return;
        setAllRows(
          onlySubmittedRows(filterRowsToLivePending(result.rows, livePendingIds)),
        );
        setNextServerOffset(result.nextOffset ?? 0);
        setServerHasMore(result.hasMore);
        setHasLoadedFromServer(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not load saved forms";
        if (localCount > 0) {
          setSyncError(
            `${message} Showing ${localCount} form(s) saved on this device.`,
          );
        } else {
          setSyncError(message);
        }
        setHasLoadedFromServer(true);
        await pruneStalePendingFromAuditsCache(user?.id || null, activeTenantSlug).catch(
          () => {},
        );
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTenantSlug, offline, accessToken, user?.id]);

  async function loadMoreFromServer() {
    if (
      !accessToken ||
      !activeTenantSlug ||
      offline ||
      !serverHasMore ||
      loadingMore
    )
      return;

    setLoadingMore(true);
    setSyncError("");
    try {
      const result = await fetchAndCacheAuditsList(
        accessToken,
        user?.id || null,
        activeTenantSlug,
        {
          limit: 100,
          offset: nextServerOffset,
          status: "SUBMITTED",
          merge: true,
        },
      );
      setAllRows(onlySubmittedRows(result.rows));
      setNextServerOffset(result.nextOffset ?? nextServerOffset);
      setServerHasMore(result.hasMore);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not load more";
      setSyncError(message);
    } finally {
      setLoadingMore(false);
    }
  }

  const submittedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = onlySubmittedRows(allRows);
    if (!normalizedQuery) return base;
    return base.filter((row) =>
      row.template.title.toLowerCase().includes(normalizedQuery),
    );
  }, [allRows, query]);

  const groupedRows = useMemo(
    () => groupRowsBySavedDate(submittedRows),
    [submittedRows],
  );

  function toggleSelected(auditId: string) {
    setSelectedIds((current) =>
      current.includes(auditId)
        ? current.filter((id) => id !== auditId)
        : [...current, auditId],
    );
  }

  function deletableSelectedIds(ids: string[]) {
    return ids.filter((id) => !isDevicePendingAuditId(id));
  }

  async function performDelete(auditIds: string[]) {
    const token = accessToken;
    if (!token || !activeTenantSlug || offline || !auditIds.length) return;

    setDeleting(true);
    setSyncError("");
    try {
      const res = await fetch(apiUrl("/api/audit/delete"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug: activeTenantSlug, auditIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");

      const deletedSet = new Set(auditIds);
      setAllRows((current) => {
        const next = current.filter((row) => !deletedSet.has(row.id));
        writeAuditsListCache(user?.id || null, activeTenantSlug, onlySubmittedRows(next));
        return next;
      });
      setSelectedIds((current) => current.filter((id) => !deletedSet.has(id)));
      setSelectionMode(false);

      const storage = data.storage as { totalMb?: number; auditLogsMb?: number } | undefined;
      setDeleteFeedback(
        `Deleted ${data.deleted ?? auditIds.length} form(s). Brand storage is now ~${storage?.totalMb ?? "?"} MB` +
          (storage?.auditLogsMb != null ? ` (submissions: ~${storage.auditLogsMb} MB).` : ".") +
          " Check Settings → Plan & usage to confirm.",
      );
      window.dispatchEvent(new CustomEvent("brand-storage-changed"));
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : "Could not delete forms");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  function requestDelete(ids: string[], label: string) {
    const serverIds = deletableSelectedIds(ids);
    if (!serverIds.length) {
      setSyncError("Only synced submissions can be deleted. Pending offline items will drop off when cleared locally.");
      return;
    }
    setDeleteConfirm({ ids: serverIds, label });
  }

  function toggleSelectAllVisible() {
    const visibleIds = submittedRows.map((row) => row.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(
      allSelected
        ? selectedIds.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...selectedIds, ...visibleIds])),
    );
  }

  return (
    <>
      <div className="mb-5 overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-sm">
        <div className="flex flex-col gap-4 border-b border-foreground/10 bg-gradient-to-r from-foreground/[0.035] to-transparent p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground/75"><FileText className="h-5 w-5" /></div>
            <div>
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              Submitted Forms
              <span className="rounded-full border border-foreground/10 bg-foreground/[0.035] px-2.5 py-0.5 text-xs font-medium text-foreground/65">{submittedRows.length} {submittedRows.length === 1 ? "form" : "forms"}</span>
            </div>
            <div className="mt-1 text-sm text-foreground/60">
              {offline
                ? deviceReady
                  ? "Offline mode — showing forms saved on this device."
                  : "Loading forms saved on this device…"
                : syncing && submittedRows.length === 0
                  ? "Loading recent forms…"
                  : hasLoadedFromServer || submittedRows.length > 0
                    ? "Recent forms are ready. Load more when you need older history."
                    : "Browse and share submitted forms."}
            </div>
          </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                if (selectionMode) {
                  setSelectionMode(false);
                  setSelectedIds([]);
                } else {
                  setSelectionMode(true);
                }
              }}
              className={
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors " +
                (selectionMode
                  ? "border-foreground/25 bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.12]"
                  : "border-foreground/15 bg-background text-foreground/80 hover:bg-foreground/[0.04]")
              }
            >
              <CheckSquare className="h-4 w-4" />
              {selectionMode ? "Done selecting" : "Select"}
            </button>
            <StoredFormsShareMenu
              tenantSlug={activeTenantSlug}
              rows={submittedRows}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onToggleSelectionMode={() => setSelectionMode((value) => !value)}
              onClearSelection={() => {
                setSelectedIds([]);
                setSelectionMode(false);
              }}
            />
            {selectionMode ? (
              <>
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-foreground/15 bg-background px-3.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.04]"
                >
                  <CheckSquare className="h-4 w-4" />
                  {submittedRows.length > 0 &&
                  submittedRows.every((row) => selectedIds.includes(row.id))
                    ? "Clear visible"
                    : "Select visible"}
                </button>
                <div className="inline-flex h-10 items-center rounded-lg border border-foreground/10 bg-foreground/[0.04] px-3.5 text-sm font-medium text-foreground/75">
                  {selectedIds.length} selected
                </div>
                {canDeleteAudits && !offline && selectedIds.length > 0 ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() =>
                      requestDelete(
                        selectedIds,
                        `${deletableSelectedIds(selectedIds).length} selected form(s)`,
                      )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete selected
                  </button>
                ) : null}
              </>
            ) : null}
            {!offline && serverHasMore ? (
              <button
                type="button"
                disabled={loadingMore || syncing}
                onClick={() => void loadMoreFromServer()}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/15 bg-background px-3.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.04] disabled:opacity-60"
              >
                {loadingMore ? "Loading more…" : "Load more"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {syncError ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-800">
          {syncError}
        </div>
      ) : null}

      {deleteFeedback ? (
        <div role="status" className="mb-4 rounded-xl border border-green-300/70 bg-green-50 px-4 py-3 text-sm text-green-800">
          {deleteFeedback}
        </div>
      ) : null}

      {selectionMode ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.035] px-4 py-3">
          <div className="text-sm text-foreground/70">
            Tick forms to share or delete
            {canDeleteAudits ? " — managers/admins can bulk-delete to free storage" : ""}.
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectionMode(false);
              setSelectedIds([]);
            }}
            className="shrink-0 rounded-lg border border-foreground/15 px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-foreground/[0.04]"
          >
            Cancel selection
          </button>
        </div>
      ) : null}

      <div className="mb-5 rounded-2xl border border-foreground/10 bg-background p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search submitted forms"
              aria-label="Search submitted forms by template title"
              className="h-10 w-full rounded-lg border border-foreground/15 bg-background pl-9 pr-3 text-sm outline-none transition focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            />
          </div>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="h-10 rounded-lg border border-foreground/15 px-4 text-sm font-medium text-foreground/70 hover:bg-foreground/[0.04]"
            >
              Clear search
            </button>
          ) : null}
        </div>
      </div>

      {submittedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-foreground/20 bg-background px-6 py-12 text-center text-sm text-foreground/65">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground/50">
            {syncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{query.trim() ? "No matching forms" : "No submitted forms yet"}</h3>
          <p className="mx-auto mt-1 max-w-md">
            {query.trim()
            ? "Try another search term or clear your search."
            : offline
              ? "No forms on this device yet. Connect once to pull submitted forms."
              : syncing
                ? "Loading forms…"
                : "No submitted forms yet."}
          </p>
          {query.trim() ? <button type="button" onClick={() => setQuery("")} className="mt-4 text-sm font-medium underline underline-offset-4">Clear search</button> : null}
        </div>
      ) : (
        <div className="space-y-7">
            {groupedRows.map((group) => (
              <section key={group.dateKey} className="space-y-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.055] text-foreground/55"><CalendarDays className="h-4 w-4" /></div>
                    <div>
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                      <p className="text-xs text-foreground/55">{group.rows.length} {group.rows.length === 1 ? "submission" : "submissions"}</p>
                    </div>
                  </div>
                  {selectionMode ? (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = group.rows.map((row) => row.id);
                        const allInGroup = ids.every((id) => selectedIds.includes(id));
                        setSelectedIds((current) =>
                          allInGroup
                            ? current.filter((id) => !ids.includes(id))
                            : Array.from(new Set([...current, ...ids])),
                        );
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground"
                    >
                      {group.rows.every((row) => selectedIds.includes(row.id))
                        ? "Clear group"
                        : "Select group"}
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2.5">
                {group.rows.map((row) => (
              <div
                key={row.id}
                className="group flex flex-col gap-3 rounded-xl border border-foreground/10 bg-background p-3.5 shadow-sm transition hover:border-foreground/20 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                    {selectionMode ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-foreground/30 accent-foreground"
                        aria-label={`Select ${row.template.title}`}
                      />
                    ) : null}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.045] text-foreground/55"><FileText className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="line-clamp-2 font-semibold leading-snug">
                        {row.template.title}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/55">
                        Submitted{" "}
                        {new Date(
                          row.submittedAt || row.updatedAt,
                        ).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {row.devicePending || isDevicePendingAuditId(row.id) ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Pending sync
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
                    <SavedFormRowActions
                      tenantSlug={activeTenantSlug}
                      auditId={row.id}
                      templateId={row.templateId}
                      layout="row"
                      canDelete={
                        canDeleteAudits &&
                        !offline &&
                        !row.devicePending &&
                        !isDevicePendingAuditId(row.id)
                      }
                      onDelete={() =>
                        requestDelete([row.id], `"${row.template.title}"`)
                      }
                    />
                  </div>
                </div>
                ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <NotificationModal
        open={Boolean(deleteConfirm)}
        title="Delete saved forms?"
        message={
          deleteConfirm
            ? `Permanently delete ${deleteConfirm.label}? This cannot be undone and should reduce brand storage usage.`
            : ""
        }
        tone="warning"
        actionLabel={deleting ? "Deleting…" : "Delete"}
        actionTone="danger"
        onAction={() => {
          if (!deleteConfirm || deleting) return;
          void performDelete(deleteConfirm.ids);
        }}
        onClose={() => !deleting && setDeleteConfirm(null)}
      />
    </>
  );
}
