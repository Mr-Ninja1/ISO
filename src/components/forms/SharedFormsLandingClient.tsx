"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";
import { auditReportHref } from "@/lib/client/tenantNavigation";
import type { SharedFormsLinkPayload } from "@/lib/sharedForms";

function groupRowsByDate(rows: CachedAuditRow[]) {
  const groups = new Map<string, CachedAuditRow[]>();
  for (const row of rows) {
    const timestamp = row.submittedAt || row.updatedAt || row.createdAt;
    const day = new Date(timestamp).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    groups.set(day, [...(groups.get(day) || []), row]);
  }
  return Array.from(groups.entries());
}

export function SharedFormsLandingClient({
  payload,
  rows,
}: {
  payload: SharedFormsLinkPayload;
  rows: CachedAuditRow[];
}) {
  const grouped = useMemo(() => groupRowsByDate(rows), [rows]);
  const brandLabel = payload.tenantName || payload.tenantSlug;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="rounded-2xl border border-foreground/15 bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-foreground/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60">
              Shared forms
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              {payload.title}
            </h1>
            <p className="mt-1 text-sm text-foreground/70">
              Read-only browser review for {brandLabel}. Open any form below to
              inspect it cleanly without downloading a PDF.
            </p>
          </div>
          <div className="grid gap-1 text-sm text-foreground/65 sm:text-right">
            <div>
              {rows.length} form{rows.length === 1 ? "" : "s"}
            </div>
            <div>Shared {new Date(payload.createdAt).toLocaleString()}</div>
            <div>
              {payload.mode === "live_today"
                ? "Live link • Today's forms"
                : payload.mode === "live_all"
                  ? "Live link • Saved forms"
                  : payload.mode === "today"
                    ? "Snapshot • Today's forms"
                    : payload.mode === "all"
                      ? "Snapshot • All shared forms"
                      : "Snapshot • Selected forms"}
            </div>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-foreground/15 bg-background p-4 text-sm text-foreground/70">
          No forms are available in this shared view right now.
        </div>
      ) : null}

      {grouped.map(([day, items]) => (
        <section
          key={day}
          className="rounded-2xl border border-foreground/15 bg-background p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-3">
            <div>
              <h2 className="text-lg font-semibold">{day}</h2>
              <p className="text-sm text-foreground/60">
                {items.length} form{items.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {items.map((row) => (
              <Link
                key={row.id}
                href={auditReportHref(payload.tenantSlug, row.id)}
                className="rounded-xl border border-foreground/15 p-4 transition hover:bg-foreground/5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{row.template.title}</div>
                    <div className="mt-1 text-sm text-foreground/60">
                      Submitted{" "}
                      {new Date(
                        row.submittedAt || row.updatedAt || row.createdAt,
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-foreground/15 px-3 py-1 text-xs text-foreground/65">
                    Open form
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
