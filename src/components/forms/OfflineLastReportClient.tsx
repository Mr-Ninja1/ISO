"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Snapshot = {
  tenantSlug: string;
  auditId: string;
  title: string;
  status: string;
  createdAt: string;
  tenantName: string;
  payload: Record<string, unknown>;
  ts: number;
};

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

export function OfflineLastReportClient({ tenantSlug }: { tenantSlug: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    try {
      const lastAuditId = localStorage.getItem(`audit-report-last:v1:${tenantSlug}`);
      if (!lastAuditId) return;
      const raw = localStorage.getItem(`audit-report-snapshot:v1:${tenantSlug}:${lastAuditId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Snapshot;
      if (!parsed || typeof parsed !== "object") return;
      setSnapshot(parsed);
    } catch {
      setSnapshot(null);
    }
  }, [tenantSlug]);

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
          No cached report found on this device yet.
        </div>
        <Link href={`/${tenantSlug}/audits`} className="text-sm underline">
          Back to stored forms
        </Link>
      </div>
    );
  }

  const entries = Object.entries(snapshot.payload).filter(([key]) => !key.startsWith("__"));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-foreground/20 bg-background p-4">
        <h2 className="text-lg font-semibold">{snapshot.title}</h2>
        <div className="mt-1 text-xs text-foreground/70">
          Cached offline snapshot • {snapshot.tenantName} • {new Date(snapshot.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="rounded-md border border-foreground/20 bg-background p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">Status</div>
        <div className="text-sm">{snapshot.status}</div>
      </div>

      <div className="rounded-md border border-foreground/20 bg-background p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">Saved values</div>
        <div className="space-y-2">
          {entries.length ? entries.map(([key, value]) => (
            <div key={key} className="rounded border border-foreground/15 p-2">
              <div className="text-xs text-foreground/60">{key}</div>
              <div className="text-sm break-words">{asText(value) || "-"}</div>
            </div>
          )) : <div className="text-sm text-foreground/70">No values in snapshot.</div>}
        </div>
      </div>

      <Link href={`/${tenantSlug}/audits`} className="text-sm underline">
        Back to stored forms
      </Link>
    </div>
  );
}
