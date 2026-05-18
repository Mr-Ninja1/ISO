"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, MoreVertical, Share2, Printer, Loader2 } from "lucide-react";
import { AuditsExportButton } from "@/components/forms/AuditsExportButton";
import { shareAuditLink } from "@/components/forms/AuditShareControls";
import { useAuth } from "@/components/AuthProvider";
import {
  readAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";
import { generatePdfFromElement, generatePdfBlobFromElement } from "@/lib/pdfGenerator";
import { fetchAndCacheAuditsList } from "@/lib/client/auditsListSync";
import { useAppOffline } from "@/lib/client/useAppOffline";

type StatusFilter = "ALL" | "DRAFT" | "SUBMITTED";

function CardMenu({
  tenantSlug,
  auditId,
  templateTitle,
  status,
}: {
  tenantSlug: string;
  auditId: string;
  templateTitle: string;
  status: "DRAFT" | "SUBMITTED";
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleDownloadPdf = async () => {
    setOpen(false);
    setGenerating(true);
    try {
      const reportUrl = `/${tenantSlug}/audits/${auditId}`;
      window.open(reportUrl, "_blank");
      // The report page will handle PDF generation via its own print button
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    setOpen(false);
    setGenerating(true);
    try {
      const reportUrl = `${window.location.origin}/${tenantSlug}/audits/${auditId}`;
      void shareAuditLink(reportUrl, templateTitle);
    } finally {
      setGenerating(false);
    }
  };

  const handleView = () => {
    setOpen(false);
    window.location.href = `/${tenantSlug}/audits/${auditId}`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={generating}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5 disabled:opacity-60"
        aria-label="More options"
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-foreground/20 bg-background p-1 shadow-lg">
            <button
              type="button"
              onClick={handleView}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
            >
              <FileText className="h-4 w-4" />
              View report
            </button>
            {status === "SUBMITTED" && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={generating}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={generating}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-60"
                >
                  <Share2 className="h-4 w-4" />
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
  initialStatus,
  initialQuery,
  rows,
}: {
  tenantSlug: string;
  initialStatus: StatusFilter;
  initialQuery: string;
  rows: CachedAuditRow[];
}) {
  const { session, user } = useAuth();
  const offline = useAppOffline();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [query, setQuery] = useState(initialQuery);
  const [allRows, setAllRows] = useState<CachedAuditRow[]>(rows);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [hasLoadedFromServer, setHasLoadedFromServer] = useState(false);

  useEffect(() => {
    const cached = readAuditsListCache(user?.id || null, tenantSlug);
    if (cached?.rows?.length) {
      setAllRows((current) => {
        const next = current.length >= cached.rows.length ? current : cached.rows;
        return rowsAreEqual(current, next) ? current : next;
      });
    }
  }, [tenantSlug, user?.id]);

  useEffect(() => {
    const onCacheUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const cached = readAuditsListCache(user?.id || null, tenantSlug);
      if (!cached?.rows?.length) return;
      setAllRows((current) => {
        const merged = rowsAreEqual(current, cached.rows) ? current : cached.rows;
        return rowsAreEqual(current, merged) ? current : merged;
      });
    };

    window.addEventListener("audits-cache-updated", onCacheUpdate as EventListener);
    return () => {
      window.removeEventListener("audits-cache-updated", onCacheUpdate as EventListener);
    };
  }, [tenantSlug, user?.id]);

  async function syncFromServer(fullHistory: boolean) {
    const token = session?.access_token || "";
    if (!token || !tenantSlug || offline) return;

    setSyncing(true);
    setSyncError("");
    try {
      const cached = readAuditsListCache(user?.id || null, tenantSlug);
      const result = await fetchAndCacheAuditsList(token, user?.id || null, tenantSlug, {
        since: fullHistory ? undefined : cached?.maxUpdatedAt || undefined,
        limit: fullHistory ? 200 : 80,
        merge: true,
        persistCache: false,
      });
      setAllRows(result.rows);
      setHasLoadedFromServer(true);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : "Could not load saved forms");
    } finally {
      setSyncing(false);
    }
  }

  const draftCount = useMemo(() => allRows.filter((r) => r.status === "DRAFT").length, [allRows]);
  const submittedCount = useMemo(() => allRows.filter((r) => r.status === "SUBMITTED").length, [allRows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return row.template.title.toLowerCase().includes(normalizedQuery);
    });
  }, [allRows, statusFilter, query]);

  const draftRows = useMemo(() => filteredRows.filter((r) => r.status === "DRAFT"), [filteredRows]);
  const submittedRows = useMemo(() => filteredRows.filter((r) => r.status === "SUBMITTED"), [filteredRows]);

  const exportStatus = statusFilter === "ALL" ? undefined : statusFilter;
  const exportQuery = query.trim();

  return (
    <>
      {offline ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Showing saved forms stored on this device. Connect to the internet and tap Load from server to see the full
          history.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center">
        <AuditsExportButton tenantSlug={tenantSlug} status={exportStatus} query={exportQuery} />
        {!offline ? (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void syncFromServer(true)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-xs font-medium disabled:opacity-60"
          >
            {syncing ? "Loading…" : hasLoadedFromServer ? "Refresh from server" : "Load from server"}
          </button>
        ) : null}
        {syncing ? (
          <div className="inline-flex h-9 items-center rounded-md border border-foreground/20 px-3 text-xs text-foreground/70">
            Syncing…
          </div>
        ) : null}
      </div>

      {syncError ? (
        <div className="rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground">
          {syncError}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className={
            "shrink-0 rounded-md border px-3 py-2 text-sm " +
            (statusFilter === "ALL" ? "border-foreground bg-foreground text-background" : "border-foreground/20")
          }
        >
          All ({draftCount + submittedCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("DRAFT")}
          className={
            "shrink-0 rounded-md border px-3 py-2 text-sm " +
            (statusFilter === "DRAFT" ? "border-foreground bg-foreground text-background" : "border-foreground/20")
          }
        >
          Drafts ({draftCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("SUBMITTED")}
          className={
            "shrink-0 rounded-md border px-3 py-2 text-sm " +
            (statusFilter === "SUBMITTED" ? "border-foreground bg-foreground text-background" : "border-foreground/20")
          }
        >
          Submitted ({submittedCount})
        </button>
        <Link
          href={`/${tenantSlug}/templates`}
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

      {filteredRows.length === 0 ? (
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          No forms found for this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {draftRows.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground/90">Drafts ({draftRows.length})</h3>
              <div className="space-y-2">
                {draftRows.map((row) => (
                  <div key={row.id} className="rounded-md border border-foreground/20 bg-background p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="line-clamp-2 font-medium">{row.template.title}</div>
                        <div className="mt-0.5 text-xs text-foreground/70 break-words">
                          Updated {new Date(row.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <Link
                          href={`/${tenantSlug}/audits/new?templateId=${encodeURIComponent(row.templateId)}&auditId=${encodeURIComponent(row.id)}`}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm sm:w-auto"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="hidden sm:inline">Continue draft</span>
                          <span className="sm:hidden">Continue</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {submittedRows.length > 0 ? (
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
                        </div>
                      </div>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <div className="hidden sm:flex w-full items-center gap-2 sm:w-auto">
                          <Link
                            href={`/${tenantSlug}/audits/${row.id}`}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm"
                          >
                            <FileText className="h-4 w-4" />
                            View report
                          </Link>
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                            onClick={() => {
                              const reportUrl = `${window.location.origin}/${tenantSlug}/audits/${row.id}`;
                              void shareAuditLink(reportUrl, row.template.title);
                            }}
                          >
                            <Share2 className="h-4 w-4" />
                            <span className="hidden sm:inline">Share</span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                            onClick={() => {
                              const reportUrl = `/${tenantSlug}/audits/${row.id}`;
                              window.open(reportUrl, "_blank");
                            }}
                          >
                            <Printer className="h-4 w-4" />
                            <span className="hidden sm:inline">PDF</span>
                          </button>
                        </div>
                        <div className="flex sm:hidden">
                          <CardMenu
                            tenantSlug={tenantSlug}
                            auditId={row.id}
                            templateTitle={row.template.title}
                            status={row.status}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
