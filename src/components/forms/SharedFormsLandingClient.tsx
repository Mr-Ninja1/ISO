"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock3, ExternalLink, FileSearch, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";
import type { SharedFormsLinkPayload } from "@/lib/sharedForms";
import type { SharedFormsConnectionState } from "@/app/shared/forms/page";

function rowTime(row: CachedAuditRow) {
  return new Date(row.submittedAt || row.updatedAt || row.createdAt).getTime();
}

function formatDate(timestamp: string) {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function modeLabel(mode: SharedFormsLinkPayload["mode"]) {
  if (mode === "live_today") return "Live today";
  if (mode === "live_all") return "Live brand view";
  if (mode === "today") return "Today’s snapshot";
  if (mode === "all") return "All saved forms";
  return "Selected forms";
}

export function SharedFormsLandingClient({
  payload,
  rows,
  lastUpdated,
  onRefresh,
  connectionState,
  refreshing,
}: {
  payload: SharedFormsLinkPayload;
  rows: CachedAuditRow[];
  lastUpdated: Date | null;
  onRefresh: () => void;
  connectionState: SharedFormsConnectionState;
  refreshing: boolean;
}) {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [query, setQuery] = useState("");
  const brandLabel = payload.tenantName || payload.tenantSlug;
  const isLive = payload.mode === "live_today" || payload.mode === "live_all";
  const connectionMessage =
    connectionState === "offline"
      ? "You are offline. Showing the last loaded forms."
      : connectionState === "slow"
        ? "The connection is slow. We are keeping the last loaded forms visible."
        : connectionState === "unavailable"
          ? "Live updates are unavailable right now. Use Refresh when you are ready."
          : connectionState === "connecting"
            ? "Connecting to live updates…"
            : isLive
              ? "Live updates connected"
              : "Snapshot loaded";

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...rows]
      .sort((a, b) => rowTime(b) - rowTime(a))
      .filter((row) => !normalized || row.template.title.toLowerCase().includes(normalized));
  }, [query, rows]);

  function handleRefresh() {
    if (refreshing) return;
    onRefresh();
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--hse-sky)_42%,transparent),transparent_32%),var(--background)] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-[color-mix(in_srgb,var(--surface)_88%,var(--hse-sky))] p-5 shadow-[0_20px_60px_rgba(0,61,51,0.1)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--hse-teal)]/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--hse-teal)]/20 bg-[var(--hse-teal)]/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hse-teal)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure shared workspace
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground/55">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${connectionState === "live" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" : connectionState === "offline" || connectionState === "slow" ? "border-amber-500/25 bg-amber-500/10 text-amber-800" : "border-foreground/15 bg-foreground/5 text-foreground/60"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connectionState === "live" ? "animate-pulse bg-emerald-500" : connectionState === "offline" || connectionState === "slow" ? "bg-amber-500" : "bg-foreground/40"}`} />
                  {connectionMessage}
                </span>
                <span>{modeLabel(payload.mode)}</span>
              </div>
            </div>
            <div className="mt-7 max-w-3xl">
              <p className="text-sm font-medium text-[var(--hse-teal)]">{brandLabel}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{payload.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/65">
                Review submitted forms in one place. Open a record for the full response, search by form name, or save any record as a PDF when you need a file.
              </p>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 bg-background/70 px-3.5 py-2.5 text-sm">
                <FileSearch className="h-4 w-4 text-[var(--hse-teal)]" />
                <strong>{rows.length}</strong> form{rows.length === 1 ? "" : "s"} available
              </div>
              {isLive && lastUpdated ? <span className="text-xs text-foreground/50">Last checked {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
            </div>
          </div>
        </section>

        <section className="sticky top-3 z-10 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-background/90 p-3 shadow-lg backdrop-blur-md sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search forms by name"
              className="h-11 w-full rounded-xl border border-foreground/15 bg-background pl-9 pr-3 text-sm outline-none transition focus:border-[var(--hse-teal)] focus:ring-2 focus:ring-[var(--hse-teal)]/15"
              aria-label="Search shared forms"
            />
          </label>
          <button type="button" onClick={handleRefresh} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-foreground/15 px-4 text-sm font-medium transition hover:bg-foreground/5 disabled:opacity-60" disabled={refreshing || connectionState === "offline"}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </section>
        {connectionState !== "live" ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
            {connectionMessage} Your current forms remain available while we reconnect.
          </div>
        ) : null}

        {visibleRows.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-foreground/20 bg-background/70 p-10 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-[var(--hse-teal)]" />
            <h2 className="mt-3 font-semibold">{rows.length ? "No forms match that search" : "No forms available yet"}</h2>
            <p className="mt-1 text-sm text-foreground/60">{rows.length ? "Try a different form name." : isLive ? "New submissions will appear here automatically." : "There are no submitted forms in this shared view."}</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-sm">
            <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-4 border-b border-foreground/10 bg-foreground/[0.025] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45 sm:grid">
              <span>Submitted form</span><span>Submitted</span><span />
            </div>
            <div className="divide-y divide-foreground/10">
              {visibleRows.map((row, index) => {
                const timestamp = row.submittedAt || row.updatedAt || row.createdAt;
                return (
                  <Link
                    key={row.id}
                    href={`/shared/forms/form?token=${encodeURIComponent(token)}&auditId=${encodeURIComponent(row.id)}`}
                    className="group grid gap-3 px-4 py-4 transition hover:bg-[var(--hse-teal)]/[0.04] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)]/10 text-xs font-semibold text-[var(--hse-teal)]">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold text-foreground group-hover:text-[var(--hse-teal)]">{row.template.title}</h2>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground/55 sm:hidden"><Clock3 className="h-3.5 w-3.5" />{formatDate(timestamp)}</p>
                      </div>
                    </div>
                    <span className="hidden whitespace-nowrap text-sm text-foreground/60 sm:block">{formatDate(timestamp)}</span>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-foreground/15 px-3 py-2 text-xs font-medium text-foreground/65 group-hover:border-[var(--hse-teal)]/30 group-hover:text-[var(--hse-teal)]">Open <ExternalLink className="h-3.5 w-3.5" /></span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        <p className="pb-3 text-center text-xs text-foreground/40">Read-only access • Shared forms are shown securely from the brand workspace</p>
      </div>
    </main>
  );
}
