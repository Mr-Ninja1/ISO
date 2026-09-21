"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AUDIT_OUTBOX_CHANGED_EVENT,
  getOfflineSubmittedForms,
  type OfflineSubmittedForm,
} from "@/lib/client/auditSyncQueue";
import { auditReportHref, tenantRouteHref } from "@/lib/client/tenantNavigation";

type Props = {
  tenantSlug: string;
  notice?: string;
};

export function OfflineSubmittedFormsClient({ tenantSlug, notice }: Props) {
  const [rows, setRows] = useState<OfflineSubmittedForm[]>([]);

  useEffect(() => {
    if (!tenantSlug || tenantSlug === "_") {
      setRows([]);
      return;
    }

    const load = () => {
      setRows(getOfflineSubmittedForms(tenantSlug));
    };

    load();
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    window.addEventListener(AUDIT_OUTBOX_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
      window.removeEventListener(AUDIT_OUTBOX_CHANGED_EVENT, load);
    };
  }, [tenantSlug]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Offline saved submissions</h2>
          <p className="text-sm text-foreground/70">
            Queued submissions stay on this device until sync finishes. Tap View report to open one anytime.
          </p>
        </div>
        <Link href={tenantRouteHref(tenantSlug, "audits")} className="text-sm underline">
          Open stored forms
        </Link>
      </div>

      {notice === "queued-submit" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Submission was saved offline and queued. It will be pushed automatically when internet is back.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          No offline queued submissions.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const reportHref = auditReportHref(tenantSlug, `pending:${row.queueId}`);
            return (
              <div key={row.localId} className="rounded-md border border-foreground/20 bg-background p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{row.templateTitle}</div>
                    <div className="text-xs text-foreground/70">
                      Queued {new Date(row.createdAt).toLocaleString()} • Pending sync
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-900">
                      Offline queued
                    </span>
                    <Link
                      href={reportHref}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                    >
                      View report
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
