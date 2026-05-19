"use client";

import type { AuditReportData } from "@/types/auditReport";
import { getOfflineSubmittedForms } from "@/lib/client/auditSyncQueue";
import { dbGetTemplate, dbListOutbox } from "@/lib/client/formsDb";
import type { FormSchemaV1 } from "@/types/forms";

/** Parse cached full-page snapshot written when a report was viewed or submitted. */
export function parseReportSnapshotFromLocalStorage(tenantSlug: string, auditId: string): AuditReportData | null {
  if (typeof window === "undefined" || !tenantSlug || !auditId) return null;
  try {
    const raw = localStorage.getItem(`audit-report-snapshot:v1:${tenantSlug}:${auditId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      title?: string;
      status?: string;
      createdAt?: string;
      tenantName?: string;
      payload?: Record<string, unknown>;
    };
    if (!parsed?.payload || typeof parsed.payload !== "object" || Array.isArray(parsed.payload)) return null;
    return {
      id: auditId,
      status: parsed.status || "SUBMITTED",
      createdAt: parsed.createdAt || new Date().toISOString(),
      payload: parsed.payload as Record<string, unknown>,
      tenant: { name: parsed.tenantName || tenantSlug, slug: tenantSlug, logoUrl: null },
      template: { title: parsed.title || "Form", schema: null },
    };
  } catch {
    return null;
  }
}

/** Queued / offline-only submission payloads keyed by server audit id or draft id. */
export async function buildReportFromDeviceStores(tenantSlug: string, auditId: string): Promise<AuditReportData | null> {
  if (!tenantSlug || !auditId) return null;

  try {
    const outbox = await dbListOutbox(tenantSlug);
    for (const item of outbox) {
      if (item.mode !== "submit") continue;
      const pendingId = `pending:${item.id}`;
      const matches =
        auditId === pendingId || (item.auditId && item.auditId === auditId);
      if (!matches) continue;

      const tpl = await dbGetTemplate(tenantSlug, item.templateId);
      const reportId = auditId === pendingId ? pendingId : auditId;
      return {
        id: reportId,
        status: "SUBMITTED",
        createdAt: new Date(item.createdAt).toISOString(),
        payload: item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {},
        tenant: { name: tpl?.tenantName || tenantSlug, slug: tenantSlug, logoUrl: tpl?.tenantLogoUrl ?? null },
        template: { title: tpl?.title || "Form", schema: tpl?.schema ?? null },
        templateId: item.templateId,
      };
    }
  } catch {
    // ignore
  }

  try {
    for (const form of getOfflineSubmittedForms(tenantSlug)) {
      const matchQueue = auditId === `pending:${form.queueId}`;
      if (!matchQueue) continue;
      const tpl = await dbGetTemplate(tenantSlug, form.templateId);
      return {
        id: auditId,
        status: "SUBMITTED",
        createdAt: new Date(form.createdAt).toISOString(),
        payload:
          form.payload && typeof form.payload === "object" && !Array.isArray(form.payload) ? form.payload : {},
        tenant: { name: tpl?.tenantName || tenantSlug, slug: tenantSlug, logoUrl: tpl?.tenantLogoUrl ?? null },
        template: { title: form.templateTitle || tpl?.title || "Form", schema: tpl?.schema ?? null },
        templateId: form.templateId,
      };
    }
  } catch {
    // ignore
  }

  return null;
}

export async function enrichReportWithCachedTemplateSchema(
  tenantSlug: string,
  templateId: string | undefined,
  audit: AuditReportData
): Promise<AuditReportData> {
  if (!templateId || audit.template?.schema) return audit;
  try {
    const tpl = await dbGetTemplate(tenantSlug, templateId);
    if (!tpl?.schema) return audit;
    return {
      ...audit,
      template: {
        title: audit.template.title || tpl.title,
        schema: tpl.schema as FormSchemaV1,
      },
    };
  } catch {
    return audit;
  }
}
