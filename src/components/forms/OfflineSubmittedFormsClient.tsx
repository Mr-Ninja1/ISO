"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOfflineSubmittedForms, type OfflineSubmittedForm } from "@/lib/client/auditSyncQueue";

type Props = {
  tenantSlug: string;
  notice?: string;
};

export function OfflineSubmittedFormsClient({ tenantSlug, notice }: Props) {
  const [rows, setRows] = useState<OfflineSubmittedForm[]>([]);

  useEffect(() => {
    const load = () => {
      setRows(getOfflineSubmittedForms(tenantSlug));
    };

    load();
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
    };
  }, [tenantSlug]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Offline saved submissions</h2>
          <p className="text-sm text-foreground/70">Queued submissions visible immediately on this device while sync runs in background.</p>
        </div>
        <Link href={`/${tenantSlug}/audits`} className="text-sm underline">
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
          {rows.map((row) => (
            <details key={row.localId} className="rounded-md border border-foreground/20 bg-background p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{row.templateTitle}</div>
                    <div className="text-xs text-foreground/70">
                      Queued {new Date(row.createdAt).toLocaleString()} • Pending sync
                    </div>
                  </div>
                  <span className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-900">
                    Offline queued
                  </span>
                </div>
              </summary>
              <div className="mt-3 rounded-md border border-foreground/15 bg-foreground/[0.03] p-2">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(row.payload, null, 2)}
                </pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
