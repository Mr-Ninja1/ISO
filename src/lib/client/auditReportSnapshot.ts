"use client";

/** Cache a submitted form payload so View report works offline on this device. */
/** Copy a cached report snapshot to another audit id (e.g. after offline sync). */
export function copyAuditReportSnapshot(tenantSlug: string, fromAuditId: string, toAuditId: string) {
  if (typeof window === "undefined" || !tenantSlug || !fromAuditId || !toAuditId || fromAuditId === toAuditId) {
    return;
  }
  try {
    const fromKey = `audit-report-snapshot:v1:${tenantSlug}:${fromAuditId}`;
    const raw = localStorage.getItem(fromKey);
    if (!raw) return;
    const toKey = `audit-report-snapshot:v1:${tenantSlug}:${toAuditId}`;
    localStorage.setItem(toKey, raw);
    localStorage.setItem(`audit-report-last:v1:${tenantSlug}`, toAuditId);
  } catch {
    // ignore
  }
}

export function writeAuditReportSnapshot(
  tenantSlug: string,
  auditId: string,
  input: {
    title: string;
    status?: string;
    createdAt?: string;
    tenantName?: string;
    templateId?: string;
    payload: Record<string, unknown>;
  }
) {
  if (typeof window === "undefined" || !tenantSlug || !auditId) return;
  try {
    const key = `audit-report-snapshot:v1:${tenantSlug}:${auditId}`;
    localStorage.setItem(
      key,
      JSON.stringify({
        title: input.title,
        status: input.status || "SUBMITTED",
        createdAt: input.createdAt || new Date().toISOString(),
        tenantName: input.tenantName || tenantSlug,
        templateId: input.templateId || null,
        payload: input.payload,
        ts: Date.now(),
      })
    );
    localStorage.setItem(`audit-report-last:v1:${tenantSlug}`, auditId);
  } catch {
    // ignore quota errors
  }
}
