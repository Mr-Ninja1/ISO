"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuditsExportButton } from "@/components/forms/AuditsExportButton";
import { useAuth } from "@/components/AuthProvider";
import {
  mergeAuditsRows,
  readAuditsListCache,
  writeAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";

type StatusFilter = "ALL" | "DRAFT" | "SUBMITTED";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [query, setQuery] = useState(initialQuery);
  const [allRows, setAllRows] = useState<CachedAuditRow[]>(rows);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const cached = readAuditsListCache(user?.id || null, tenantSlug);
    if (cached?.rows?.length) {
      setAllRows((current) => (current.length >= cached.rows.length ? current : cached.rows));
    }
  }, [tenantSlug, user?.id]);

  useEffect(() => {
    if (allRows.length === 0) return;
    writeAuditsListCache(user?.id || null, tenantSlug, allRows);
  }, [allRows, tenantSlug, user?.id]);

  useEffect(() => {
    const onCacheUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ tenantSlug?: string }>;
      if (custom.detail?.tenantSlug !== tenantSlug) return;
      const cached = readAuditsListCache(user?.id || null, tenantSlug);
      if (!cached?.rows?.length) return;
      setAllRows((current) => {
        const merged = mergeAuditsRows(current, cached.rows);
        return merged;
      });
    };

    window.addEventListener("audits-cache-updated", onCacheUpdate as EventListener);
    return () => {
      window.removeEventListener("audits-cache-updated", onCacheUpdate as EventListener);
    };
  }, [tenantSlug, user?.id]);

  useEffect(() => {
    const token = session?.access_token || "";
    if (!token || !tenantSlug) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const cached = readAuditsListCache(user?.id || null, tenantSlug);
    const since = cached?.maxUpdatedAt || null;
    const url = new URL("/api/audit/list", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    if (since) url.searchParams.set("since", since);

    let cancelled = false;
    setSyncing(true);

    fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to sync audits list");
        return data as { rows?: CachedAuditRow[]; maxUpdatedAt?: string | null };
      })
      .then((data) => {
        if (cancelled) return;
        const incoming = Array.isArray(data.rows) ? data.rows : [];
        if (!incoming.length) return;

        setAllRows((current) => {
          const merged = mergeAuditsRows(current, incoming);
          writeAuditsListCache(user?.id || null, tenantSlug, merged, data.maxUpdatedAt || null);
          return merged;
        });
      })
      .catch(() => {
        // silent best-effort sync
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, tenantSlug, user?.id]);

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

  const exportStatus = statusFilter === "ALL" ? undefined : statusFilter;
  const exportQuery = query.trim();

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center">
        <AuditsExportButton tenantSlug={tenantSlug} status={exportStatus} query={exportQuery} />
        {syncing ? (
          <div className="inline-flex h-9 items-center rounded-md border border-foreground/20 px-3 text-xs text-foreground/70">
            Syncing latest updates...
          </div>
        ) : null}
      </div>

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
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-md border border-foreground/20 bg-background p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="line-clamp-2 font-medium">{row.template.title}</div>
                  <div className="mt-0.5 text-xs text-foreground/70 break-words">
                    Status: {row.status} • Updated {new Date(row.updatedAt).toLocaleString()}
                    {row.submittedAt ? ` • Submitted ${new Date(row.submittedAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  {row.status === "DRAFT" ? (
                    <Link
                      href={`/${tenantSlug}/audits/new?templateId=${encodeURIComponent(row.templateId)}&auditId=${encodeURIComponent(row.id)}`}
                      className="inline-flex h-10 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm sm:w-auto"
                    >
                      Continue draft
                    </Link>
                  ) : (
                    <Link
                      href={`/${tenantSlug}/audits/${row.id}`}
                      className="inline-flex h-10 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm sm:w-auto"
                    >
                      View report
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
