"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, MoreVertical, Loader2, CheckSquare } from "lucide-react";
import { FloatingActionMenu } from "@/components/workspace/FloatingActionMenu";

import { StoredFormsShareMenu } from "@/components/forms/StoredFormsShareMenu";
import { useAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  mergeAuditsRows,
  readAuditsListCache,
  writeAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";
import { fetchAndCacheAuditsList } from "@/lib/client/auditsListSync";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import {
  isDevicePendingAuditId,
  loadDeviceAuditsRows,
} from "@/lib/client/deviceAuditsRows";
import { auditReportHref } from "@/lib/client/tenantNavigation";

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
  layout,
}: {
  tenantSlug: string;
  auditId: string;
  layout: "row" | "menu";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const reportPath = auditReportHref(tenantSlug, auditId);

  useEffect(() => {
    if (!busy) return;
    const timeout = window.setTimeout(() => setBusy(false), 15_000);
    return () => window.clearTimeout(timeout);
  }, [busy]);

  function openReport() {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    router.push(reportPath);
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
        </FloatingActionMenu>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex w-full items-center gap-2 sm:w-auto">
      <button
        type="button"
        disabled={busy}
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
  const [allRows, setAllRows] = useState<CachedAuditRow[]>(rows);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [hasLoadedFromServer, setHasLoadedFromServer] = useState(false);
  const [nextServerOffset, setNextServerOffset] = useState(0);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeTenantSlug) return;
    let cancelled = false;

    void loadDeviceAuditsRows(user?.id || null, activeTenantSlug).then(
      (deviceRows) => {
        if (cancelled) return;
        setDeviceReady(true);
        if (!deviceRows.length) return;
        setAllRows((current) => {
          const merged = mergeAuditsRows(current, deviceRows);
          return rowsAreEqual(current, merged) ? current : merged;
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [activeTenantSlug, user?.id]);

  useEffect(() => {
    if (allRows.length === 0) return;
    if (!activeTenantSlug) return;
    const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
    if (cached?.rows && rowsAreEqual(cached.rows, allRows)) return;
    writeAuditsListCache(
      user?.id || null,
      activeTenantSlug,
      onlySubmittedRows(allRows),
      undefined,
      { broadcast: false },
    );
  }, [allRows, activeTenantSlug, user?.id]);

  useEffect(() => {
    const onCacheUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== activeTenantSlug) return;
      const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
      if (!cached?.rows?.length) return;
      setAllRows((current) => {
        const merged = mergeAuditsRows(current, cached.rows);
        return rowsAreEqual(current, merged) ? current : merged;
      });
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

  /** First page of server history (recent across statuses) + merge with device cache. */
  useEffect(() => {
    if (!accessToken || !activeTenantSlug || offline) return;

    let cancelled = false;
    setSyncing(true);
    setSyncError("");

    void (async () => {
      try {
        const result = await fetchAndCacheAuditsList(
          accessToken,
          user?.id || null,
          activeTenantSlug,
          {
            limit: 50,
            offset: 0,
            merge: true,
          },
        );
        if (cancelled) return;
        setAllRows(onlySubmittedRows(result.rows));
        setNextServerOffset(result.nextOffset ?? 0);
        setServerHasMore(result.hasMore);
        setHasLoadedFromServer(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not load saved forms";
        const localCount = onlySubmittedRows(
          readAuditsListCache(user?.id || null, activeTenantSlug)?.rows ??
            allRows,
        ).length;
        if (localCount > 0) {
          setSyncError(
            `${message} Showing ${localCount} form(s) saved on this device.`,
          );
        } else {
          setSyncError(message);
        }
        setHasLoadedFromServer(true);
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

  function toggleSelected(auditId: string) {
    setSelectedIds((current) =>
      current.includes(auditId)
        ? current.filter((id) => id !== auditId)
        : [...current, auditId],
    );
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
      <div className="rounded-xl border border-foreground/10 bg-background p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground/90">
              Saved forms
            </div>
            <div className="text-xs text-foreground/60">
              {offline
                ? deviceReady
                  ? "Offline mode — showing forms saved on this device."
                  : "Loading forms saved on this device…"
                : syncing && !hasLoadedFromServer
                  ? "Loading recent forms…"
                  : hasLoadedFromServer
                    ? "Recent forms are ready. Load more when you need older history."
                    : "Browse and share submitted forms."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                >
                  <CheckSquare className="h-4 w-4" />
                  {submittedRows.length > 0 &&
                  submittedRows.every((row) => selectedIds.includes(row.id))
                    ? "Clear visible"
                    : "Select visible"}
                </button>
                <div className="inline-flex h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm text-emerald-900">
                  {selectedIds.length} selected
                </div>
              </>
            ) : null}
            {!offline && serverHasMore ? (
              <button
                type="button"
                disabled={loadingMore || syncing}
                onClick={() => void loadMoreFromServer()}
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-60"
              >
                {loadingMore ? "Loading more…" : "Load more"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {syncError ? (
        <div className="rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground">
          {syncError}
        </div>
      ) : null}

      {selectionMode ? (
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
          <div className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Select the forms you want to share, then use the share controls
            above.
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectionMode(false);
              setSelectedIds([]);
            }}
            className="shrink-0 rounded-md border border-foreground/20 px-3 py-2 text-sm"
          >
            Cancel selection
          </button>
        </div>
      ) : null}

      <div className="rounded-md border border-foreground/20 bg-background p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by template title"
            className="h-10 flex-1 rounded-md border border-foreground/20 bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => setQuery("")}
            className="h-10 rounded-md border border-foreground/20 px-4 text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {submittedRows.length === 0 ? (
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          {query.trim()
            ? "No forms match your search."
            : offline
              ? "No forms on this device yet. Connect once to pull submitted forms."
              : syncing
                ? "Loading forms…"
                : "No submitted forms yet."}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground/90">
              Submitted forms ({submittedRows.length})
            </h3>
            {!offline && serverHasMore ? null : null}
          </div>
          <div className="space-y-2">
            {submittedRows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-foreground/15 bg-background p-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {selectionMode ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        className="mt-1 h-4 w-4"
                      />
                    ) : null}
                    <div>
                      <div className="line-clamp-2 font-medium">
                        {row.template.title}
                      </div>
                      <div className="mt-0.5 text-xs text-foreground/70 break-words">
                        Submitted{" "}
                        {new Date(
                          row.submittedAt || row.updatedAt,
                        ).toLocaleString()}
                        {row.devicePending || isDevicePendingAuditId(row.id) ? (
                          <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                            Pending sync
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <SavedFormRowActions
                      tenantSlug={activeTenantSlug}
                      auditId={row.id}
                      layout="row"
                    />
                    <div className="flex sm:hidden">
                      <SavedFormRowActions
                        tenantSlug={activeTenantSlug}
                        auditId={row.id}
                        layout="menu"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
