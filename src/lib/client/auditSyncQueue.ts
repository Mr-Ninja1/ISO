"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { copyAuditReportSnapshot, writeAuditReportSnapshot } from "@/lib/client/auditReportSnapshot";
import { upsertCachedAuditRow } from "@/lib/client/auditsListCache";
import { dbDeleteOutbox, dbGetTemplate, dbListOutboxAll, dbMarkOutboxFailed } from "@/lib/client/formsDb";

type QueueMode = "draft" | "submit";

export type AuditSyncItem = {
  id: string;
  tenantSlug: string;
  templateId: string;
  payload: Record<string, unknown>;
  mode: QueueMode;
  auditId?: string;
  queuedAt: number;
};

const KEY = "audit-sync-queue:v1";
const OFFLINE_SUBMITTED_KEY = "audit-offline-submitted:v1";

export type OfflineSubmittedForm = {
  localId: string;
  queueId: string;
  tenantSlug: string;
  templateId: string;
  templateTitle: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

function readQueue(): AuditSyncItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditSyncItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: AuditSyncItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function readOfflineSubmitted(): OfflineSubmittedForm[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SUBMITTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineSubmittedForm[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineSubmitted(items: OfflineSubmittedForm[]) {
  try {
    localStorage.setItem(OFFLINE_SUBMITTED_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function addOfflineSubmittedForm(item: Omit<OfflineSubmittedForm, "localId" | "createdAt">) {
  const next: OfflineSubmittedForm = {
    ...item,
    localId: `local_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    createdAt: Date.now(),
  };
  const all = readOfflineSubmitted();
  all.unshift(next);
  writeOfflineSubmitted(all.slice(0, 300));
  return next;
}

export function getOfflineSubmittedForms(tenantSlug: string) {
  return readOfflineSubmitted().filter((x) => x.tenantSlug === tenantSlug);
}

export function getAuditSyncQueueForTenant(tenantSlug: string) {
  return readQueue().filter((x) => x.tenantSlug === tenantSlug);
}

export function removeOfflineSubmittedByQueueId(queueId: string) {
  const all = readOfflineSubmitted();
  const next = all.filter((x) => x.queueId !== queueId);
  if (next.length === all.length) return;
  writeOfflineSubmitted(next);
}

export function enqueueAuditSync(item: Omit<AuditSyncItem, "id" | "queuedAt">) {
  const id = `q_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const next: AuditSyncItem = { ...item, id, queuedAt: Date.now() };
  const q = readQueue();
  q.push(next);
  writeQueue(q);
  return next;
}

export function getPendingAuditSyncCount() {
  return readQueue().length;
}

export async function flushAuditSyncQueue(accessToken: string) {
  if (!accessToken) return { processed: 0, remaining: 0 };

  // First flush durable IndexedDB outbox (survives reloads, localStorage wipes).
  let processed = 0;
  try {
    const outbox = await dbListOutboxAll();
    for (const item of outbox) {
      try {
        const res = await fetch(apiUrl("/api/audit/submit"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            tenantSlug: item.tenantSlug,
            templateId: item.templateId,
            payload: item.payload,
            mode: item.mode,
            auditId: item.auditId,
          }),
        });

        if (!res.ok) {
          await dbMarkOutboxFailed(item.id, `HTTP ${res.status}`);
          continue;
        }

        const json = (await res.json().catch(() => ({}))) as { auditId?: string };
        const serverAuditId = typeof json.auditId === "string" ? json.auditId : "";

        if (item.mode === "submit") {
          removeOfflineSubmittedByQueueId(item.id);
          const pendingId = `pending:${item.id}`;
          if (serverAuditId) {
            copyAuditReportSnapshot(item.tenantSlug, pendingId, serverAuditId);
            const tpl = await dbGetTemplate(item.tenantSlug, item.templateId);
            const title = tpl?.title || "Form";
            const payload =
              item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
                ? item.payload
                : {};
            writeAuditReportSnapshot(item.tenantSlug, serverAuditId, {
              title,
              status: "SUBMITTED",
              tenantName: tpl?.tenantName || item.tenantSlug,
              payload: payload as Record<string, unknown>,
            });
            const savedAt = new Date().toISOString();
            upsertCachedAuditRow(null, item.tenantSlug, {
              id: serverAuditId,
              status: "SUBMITTED",
              templateId: item.templateId,
              createdAt: savedAt,
              updatedAt: savedAt,
              submittedAt: savedAt,
              template: { title },
            });
          }
        }

        await dbDeleteOutbox(item.id);
        processed += 1;
      } catch (e: any) {
        await dbMarkOutboxFailed(item.id, String(e?.message || "sync failed"));
      }
    }
  } catch {
    // ignore IndexedDB issues; fall back to legacy queue below
  }

  const queue = readQueue();
  if (queue.length === 0) return { processed: 0, remaining: 0 };

  const remaining: AuditSyncItem[] = [];

  for (const item of queue) {
    try {
      const res = await fetch(apiUrl("/api/audit/submit"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug: item.tenantSlug,
          templateId: item.templateId,
          payload: item.payload,
          mode: item.mode,
          auditId: item.auditId,
        }),
      });

      if (!res.ok) {
        remaining.push(item);
        continue;
      }

      const json = (await res.json().catch(() => ({}))) as { auditId?: string };
      const serverAuditId = typeof json.auditId === "string" ? json.auditId : "";

      if (item.mode === "submit") {
        removeOfflineSubmittedByQueueId(item.id);
        const pendingId = `pending:${item.id}`;
        if (serverAuditId) {
          copyAuditReportSnapshot(item.tenantSlug, pendingId, serverAuditId);
        }
      }

      processed += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { processed, remaining: remaining.length };
}
