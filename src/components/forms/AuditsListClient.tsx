"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileText, MoreVertical, Share2, Printer, Loader2 } from "lucide-react";
import { AuditsExportButton } from "@/components/forms/AuditsExportButton";
import { shareAuditLink } from "@/components/forms/AuditShareControls";
import { useAuth } from "@/components/AuthProvider";
import { getWorkspaceAccessToken } from "@/lib/client/sessionAccessToken";
import {
  mergeAuditsRows,
  readAuditsListCache,
  writeAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";
import { generatePdfFromElement, generatePdfBlobFromElement } from "@/lib/pdfGenerator";
import { fetchAndCacheAuditsList } from "@/lib/client/auditsListSync";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { isDevicePendingAuditId, loadDeviceAuditsRows } from "@/lib/client/deviceAuditsRows";

type FormAction = "view" | "share" | "pdf";

function actionButtonClass(busy: boolean) {
  return (
    "inline-flex h-10 min-w-[7.5rem] items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm transition-colors " +
    (busy ? "cursor-wait bg-foreground/10 opacity-80" : "hover:bg-foreground/5 active:scale-[0.98]")
  );
}

function SavedFormRowActions({
  tenantSlug,
  auditId,
  templateTitle,
  status,
  layout,
}: {
  tenantSlug: string;
  auditId: string;
  templateTitle: string;
  status: "DRAFT" | "SUBMITTED";
  layout: "row" | "menu";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<FormAction | null>(null);

  async function runAction(action: FormAction) {
    if (busy) return;
    setBusy(action);
    setOpen(false);
    try {
      const reportPath = `/${tenantSlug}/audits/${auditId}`;
      if (action === "view") {
        router.push(reportPath);
        return;
      }
      if (action === "share") {
        const reportUrl = `${window.location.origin}${reportPath}`;
        await shareAuditLink(reportUrl, templateTitle);
        return;
      }
      window.open(reportPath, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  const viewLabel = busy === "view" ? "Opening…" : "View report";
  const shareLabel = busy === "share" ? "Sharing…" : "Share";
  const pdfLabel = busy === "pdf" ? "Opening PDF…" : "PDF";

  if (layout === "menu") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={Boolean(busy)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5 disabled:opacity-60"
          aria-label="More options"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-[250]" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full z-[251] mt-1 w-48 rounded-md border border-foreground/20 bg-background p-1 shadow-lg">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void runAction("view")}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
              >
                {busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {viewLabel}
              </button>
              {status === "SUBMITTED" && (
                <>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void runAction("pdf")}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
                  >
                    {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {pdfLabel}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void runAction("share")}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
                  >
                    {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    Share / WhatsApp
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="hidden sm:flex w-full items-center gap-2 sm:w-auto">
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void runAction("view")}
        className={actionButtonClass(busy === "view")}
      >
        {busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        {viewLabel}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void runAction("share")}
        className={actionButtonClass(busy === "share")}
      >
        {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        <span className="hidden sm:inline">{shareLabel}</span>
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void runAction("pdf")}
        className={actionButtonClass(busy === "pdf")}
      >
        {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        <span className="hidden sm:inline">{pdfLabel}</span>
      </button>
    </div>
  );
}

function onlySubmittedRows(rows: CachedAuditRow[]) {
  return rows.filter((r) => r.status === "SUBMITTED");
}

function rowSignature(row: CachedAuditRow) {
  return [row.id, row.status, row.templateId, row.createdAt, row.updatedAt, row.submittedAt || "", row.template.title].join("|");
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

  useEffect(() => {
    if (!activeTenantSlug) return;
    let cancelled = false;

    void loadDeviceAuditsRows(user?.id || null, activeTenantSlug).then((deviceRows) => {
      if (cancelled) return;
      setDeviceReady(true);
      if (!deviceRows.length) return;
      setAllRows((current) => {
        const merged = mergeAuditsRows(current, deviceRows);
        return rowsAreEqual(current, merged) ? current : merged;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTenantSlug, user?.id]);

  useEffect(() => {
    if (allRows.length === 0) return;
    if (!activeTenantSlug) return;
    const cached = readAuditsListCache(user?.id || null, activeTenantSlug);
    if (cached?.rows && rowsAreEqual(cached.rows, allRows)) return;
    writeAuditsListCache(user?.id || null, activeTenantSlug, onlySubmittedRows(allRows), undefined, { broadcast: false });
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

    window.addEventListener("audits-cache-updated", onCacheUpdate as EventListener);
    return () => {
      window.removeEventListener("audits-cache-updated", onCacheUpdate as EventListener);
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
        const result = await fetchAndCacheAuditsList(accessToken, user?.id || null, activeTenantSlug, {
          limit: 50,
          offset: 0,
          merge: true,
        });
        if (cancelled) return;
        setAllRows(onlySubmittedRows(result.rows));
        setNextServerOffset(result.nextOffset ?? 0);
        setServerHasMore(result.hasMore);
        setHasLoadedFromServer(true);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load saved forms";
        const localCount = onlySubmittedRows(readAuditsListCache(user?.id || null, activeTenantSlug)?.rows ?? allRows).length;
        if (localCount > 0) {
          setSyncError(`${message} Showing ${localCount} form(s) saved on this device.`);
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

  async function refreshFromServer() {
    if (!accessToken || !activeTenantSlug || offline) return;

    setSyncing(true);
    setSyncError("");
    try {
      const result = await fetchAndCacheAuditsList(accessToken, user?.id || null, activeTenantSlug, {
        limit: 200,
        offset: 0,
        merge: true,
      });
      setAllRows(onlySubmittedRows(result.rows));
      setNextServerOffset(result.nextOffset ?? 0);
      setServerHasMore(result.hasMore);
      setHasLoadedFromServer(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load saved forms";
      const localCount = onlySubmittedRows(readAuditsListCache(user?.id || null, activeTenantSlug)?.rows ?? allRows).length;
      if (localCount > 0) {
        setSyncError(`${message} Showing ${localCount} form(s) saved on this device.`);
      } else {
        setSyncError(message);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function loadMoreFromServer() {
    if (!accessToken || !activeTenantSlug || offline || !serverHasMore || loadingMore) return;

    setLoadingMore(true);
    setSyncError("");
    try {
      const result = await fetchAndCacheAuditsList(accessToken, user?.id || null, activeTenantSlug, {
        limit: 100,
        offset: nextServerOffset,
        merge: true,
      });
      setAllRows(onlySubmittedRows(result.rows));
      setNextServerOffset(result.nextOffset ?? nextServerOffset);
      setServerHasMore(result.hasMore);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load more";
      setSyncError(message);
    } finally {
      setLoadingMore(false);
    }
  }

  const submittedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = onlySubmittedRows(allRows);
    if (!normalizedQuery) return base;
    return base.filter((row) => row.template.title.toLowerCase().includes(normalizedQuery));
  }, [allRows, query]);

  const exportQuery = query.trim();

  return (
    <>
      {offline ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {deviceReady
            ? "Offline — showing forms saved on this device. Connect to load more from the server."
            : "Loading forms saved on this device…"}
        </div>
      ) : syncing && !hasLoadedFromServer ? (
        <div className="rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
          Loading recent forms from the server…
        </div>
      ) : hasLoadedFromServer ? (
        <div className="rounded-md border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Showing recent server forms plus anything saved on this device. Use Load more for older history.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center">
        <AuditsExportButton tenantSlug={activeTenantSlug} query={exportQuery} />
        {!offline ? (
          <>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void refreshFromServer()}
              className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-60"
            >
              {syncing ? "Refreshing…" : "Refresh from server"}
            </button>
            {serverHasMore ? (
              <button
                type="button"
                disabled={loadingMore || syncing}
                onClick={() => void loadMoreFromServer()}
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-60"
              >
                {loadingMore ? "Loading more…" : "Load more"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {syncError ? (
        <div className="rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground">
          {syncError}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href={`/${activeTenantSlug}/templates`}
          className="shrink-0 rounded-md border border-foreground/20 px-3 py-2 text-sm"
        >
          Run new form
        </Link>
      </div>

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
              ? "No forms on this device yet. Connect and open a form to cache it."
              : syncing
                ? "Loading forms…"
                : "No forms yet. Run a form from workspace or load more from the server."}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground/90">Submitted forms ({submittedRows.length})</h3>
          <div className="space-y-2">
            {submittedRows.map((row) => (
                  <div key={row.id} className="rounded-md border border-foreground/20 bg-background p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="line-clamp-2 font-medium">{row.template.title}</div>
                        <div className="mt-0.5 text-xs text-foreground/70 break-words">
                          Submitted {new Date(row.submittedAt || row.updatedAt).toLocaleString()}
                          {row.devicePending || isDevicePendingAuditId(row.id) ? (
                            <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900">
                              Pending sync
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <SavedFormRowActions
                          tenantSlug={activeTenantSlug}
                          auditId={row.id}
                          templateTitle={row.template.title}
                          status={row.status}
                          layout="row"
                        />
                        <div className="flex sm:hidden">
                          <SavedFormRowActions
                            tenantSlug={activeTenantSlug}
                            auditId={row.id}
                            templateTitle={row.template.title}
                            status={row.status}
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
