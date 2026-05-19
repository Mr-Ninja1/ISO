"use client";

import {
  getOfflineSubmittedForms,
  getAuditSyncQueueForTenant,
  type OfflineSubmittedForm,
} from "@/lib/client/auditSyncQueue";
import { mergeAuditsRows, readAuditsListCache, type CachedAuditRow } from "@/lib/client/auditsListCache";
import { dbGetTemplate, dbListDraftsForTenant, dbListOutbox } from "@/lib/client/formsDb";

const LOCAL_DRAFT_PREFIX = "audit-local-draft:v1:";

function isoFromMs(ms: number) {
  return new Date(ms).toISOString();
}

function pendingSubmittedRow(form: OfflineSubmittedForm): CachedAuditRow {
  const at = isoFromMs(form.createdAt);
  return {
    id: `pending:${form.queueId}`,
    status: "SUBMITTED",
    templateId: form.templateId,
    createdAt: at,
    updatedAt: at,
    submittedAt: at,
    template: { title: form.templateTitle || "Form" },
    devicePending: true,
  };
}

function scanLocalStorageDraftRows(userId: string | null, tenantSlug: string): CachedAuditRow[] {
  if (typeof window === "undefined") return [];
  const prefix = `${LOCAL_DRAFT_PREFIX}${userId || "anon"}:${tenantSlug}:`;
  const rows: CachedAuditRow[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const templateId = key.slice(prefix.length);
    if (!templateId) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { ts?: number; auditId?: string | null };
      const ts = typeof parsed.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : Date.now();
      const at = isoFromMs(ts);
      const auditId = typeof parsed.auditId === "string" && parsed.auditId ? parsed.auditId : `local-draft:${templateId}`;

      rows.push({
        id: auditId,
        status: "DRAFT",
        templateId,
        createdAt: at,
        updatedAt: at,
        submittedAt: null,
        template: { title: "Draft form" },
        devicePending: !parsed.auditId,
      });
    } catch {
      // ignore corrupt draft keys
    }
  }

  return rows;
}

/** Submitted forms on this device only (no drafts) — for stored forms list. */
export function collectDeviceSubmittedRows(userId: string | null, tenantSlug: string): CachedAuditRow[] {
  if (!tenantSlug) return [];

  const cached = (readAuditsListCache(userId, tenantSlug)?.rows ?? []).filter((r) => r.status === "SUBMITTED");
  const pendingSubmitted = getOfflineSubmittedForms(tenantSlug).map(pendingSubmittedRow);
  const queueSubmitted = getAuditSyncQueueForTenant(tenantSlug)
    .filter((item) => item.mode === "submit")
    .map((item) => {
      const at = isoFromMs(item.queuedAt);
      const auditId = item.auditId || `pending:${item.id}`;
      return {
        id: auditId,
        status: "SUBMITTED" as const,
        templateId: item.templateId,
        createdAt: at,
        updatedAt: at,
        submittedAt: at,
        template: { title: "Form" },
        devicePending: true,
      };
    });

  return mergeAuditsRows(mergeAuditsRows(cached, pendingSubmitted), queueSubmitted);
}

/** Enrich draft titles from IndexedDB template/draft stores. */
export async function enrichDeviceAuditsRows(
  userId: string | null,
  tenantSlug: string,
  rows: CachedAuditRow[]
): Promise<CachedAuditRow[]> {
  if (!tenantSlug || rows.length === 0) return rows;

  const titleByTemplate = new Map<string, string>();
  const drafts = await dbListDraftsForTenant(tenantSlug);
  for (const draft of drafts) {
    const template = await dbGetTemplate(tenantSlug, draft.templateId);
    if (template?.title) titleByTemplate.set(draft.templateId, template.title);
  }

  const outbox = await dbListOutbox(tenantSlug);
  for (const item of outbox) {
    if (titleByTemplate.has(item.templateId)) continue;
    const template = await dbGetTemplate(tenantSlug, item.templateId);
    if (template?.title) titleByTemplate.set(item.templateId, template.title);
  }

  return rows.map((row) => {
    const title = titleByTemplate.get(row.templateId);
    if (!title) return row;
    if (row.template.title !== "Draft form" && row.template.title !== "Form") return row;
    return { ...row, template: { title } };
  });
}

function outboxToRow(item: { id: string; templateId: string; mode: "draft" | "submit"; auditId?: string | null; createdAt: number }, title: string): CachedAuditRow {
  const at = isoFromMs(item.createdAt);
  const auditId = item.auditId || (item.mode === "submit" ? `pending:${item.id}` : `local-draft:${item.templateId}`);
  return {
    id: auditId,
    status: item.mode === "submit" ? "SUBMITTED" : "DRAFT",
    templateId: item.templateId,
    createdAt: at,
    updatedAt: at,
    submittedAt: item.mode === "submit" ? at : null,
    template: { title },
    devicePending: true,
  };
}

export async function loadDeviceAuditsRows(userId: string | null, tenantSlug: string): Promise<CachedAuditRow[]> {
  let rows = collectDeviceSubmittedRows(userId, tenantSlug);

  const outbox = await dbListOutbox(tenantSlug);
  if (outbox.length) {
    const outboxRows: CachedAuditRow[] = [];
    for (const item of outbox) {
      if (item.mode !== "submit") continue;
      const template = await dbGetTemplate(tenantSlug, item.templateId);
      outboxRows.push(outboxToRow(item, template?.title || "Form"));
    }
    rows = mergeAuditsRows(rows, outboxRows);
  }

  return enrichDeviceAuditsRows(userId, tenantSlug, rows);
}

export function isDevicePendingAuditId(auditId: string) {
  return auditId.startsWith("pending:") || auditId.startsWith("local-draft:");
}
