"use client";

import { useEffect } from "react";

type SnapshotInput = {
  tenantSlug: string;
  auditId: string;
  title: string;
  status: string;
  createdAt: string;
  tenantName: string;
  payload: Record<string, unknown>;
};

export function ReportSnapshotCacheWriter(data: SnapshotInput) {
  useEffect(() => {
    try {
      const key = `audit-report-snapshot:v1:${data.tenantSlug}:${data.auditId}`;
      localStorage.setItem(key, JSON.stringify({ ...data, ts: Date.now() }));
      localStorage.setItem(`audit-report-last:v1:${data.tenantSlug}`, data.auditId);
    } catch {
      // ignore
    }
  }, [data]);

  return null;
}
