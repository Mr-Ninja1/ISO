"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { copyAuditReportSnapshot, writeAuditReportSnapshot } from "@/lib/client/auditReportSnapshot";
import { upsertCachedAuditRow } from "@/lib/client/auditsListCache";
import { dbDeleteOutbox, dbGetTemplate, dbListOutboxAll, dbMarkOutboxFailed } from "@/lib/client/formsDb";
import { readClientSubmissionId } from "@/lib/submissionMeta";

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

let flushInFlight: Promise<{ processed: number; remaining: number }> | null = null;

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

/** @deprecated Prefer dbEnqueueOutbox — kept for legacy queued items only. */
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

async function countOutboxPending(): Promise<number> {
  try {
    const outbox = await dbListOutboxAll();
    return outbox.length;
  } catch {
    return 0;
  }
}

export async function getPendingAuditSyncCountAsync() {
  const [legacy, outbox] = await Promise.all([Promise.resolve(readQueue().length), countOutboxPending()]);
  return legacy + outbox;
}

async function finalizeSuccessfulSubmit(
  item: {
    id: string;
    tenantSlug: string;
    templateId: string;
    payload: Record<string, unknown>;
    mode: QueueMode;
  },
  serverAuditId: string
) {
  removeOfflineSubmittedByQueueId(item.id);
  const pendingId = `pending:${item.id}`;
  if (!serverAuditId) return;

  copyAuditReportSnapshot(item.tenantSlug, pendingId, serverAuditId);
  const tpl = await dbGetTemplate(item.tenantSlug, item.templateId);
  const title = tpl?.title || "Form";
  const payload =
    item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {};
  writeAuditReportSnapshot(item.tenantSlug, serverAuditId, {
    title,
    status: "SUBMITTED",
    tenantName: tpl?.tenantName || item.tenantSlug,
    templateId: item.templateId,
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

async function postQueuedSubmit(
  accessToken: string,
  item: {
    tenantSlug: string;
    templateId: string;
    payload: Record<string, unknown>;
    mode: QueueMode;
    auditId?: string | null;
    id: string;
  }
) {
  const clientSubmissionId = readClientSubmissionId(item.payload);
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
      clientSubmissionId: clientSubmissionId || undefined,
    }),
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status };
  }

  const json = (await res.json().catch(() => ({}))) as { auditId?: string };
  return { ok: true as const, auditId: typeof json.auditId === "string" ? json.auditId : "" };
}

async function flushAuditSyncQueueInternal(accessToken: string) {
  if (!accessToken) return { processed: 0, remaining: 0 };

  let processed = 0;
  const outboxSubmissionIds = new Set<string>();

  try {
    const outbox = await dbListOutboxAll();
    for (const item of outbox) {
      const submissionId = readClientSubmissionId(item.payload);
      if (submissionId) outboxSubmissionIds.add(submissionId);

      try {
        const result = await postQueuedSubmit(accessToken, item);
        if (!result.ok) {
          await dbMarkOutboxFailed(item.id, `HTTP ${result.status}`);
          continue;
        }

        if (item.mode === "submit") {
          await finalizeSuccessfulSubmit(item, result.auditId);
        }

        await dbDeleteOutbox(item.id);
        processed += 1;
      } catch (e: unknown) {
        await dbMarkOutboxFailed(item.id, String((e as { message?: string })?.message || "sync failed"));
      }
    }
  } catch {
    // ignore IndexedDB issues; fall back to legacy queue below
  }

  const queue = readQueue();
  if (queue.length === 0) {
    return { processed, remaining: await countOutboxPending() };
  }

  const remaining: AuditSyncItem[] = [];

  for (const item of queue) {
    const submissionId = readClientSubmissionId(item.payload);
    if (submissionId && outboxSubmissionIds.has(submissionId)) {
      processed += 1;
      continue;
    }

    try {
      const result = await postQueuedSubmit(accessToken, item);
      if (!result.ok) {
        remaining.push(item);
        continue;
      }

      if (item.mode === "submit") {
        await finalizeSuccessfulSubmit(item, result.auditId);
      }

      processed += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  const outboxRemaining = await countOutboxPending();
  return { processed, remaining: remaining.length + outboxRemaining };
}

export async function flushAuditSyncQueue(accessToken: string) {
  if (!accessToken) return { processed: 0, remaining: 0 };

  if (flushInFlight) return flushInFlight;

  flushInFlight = flushAuditSyncQueueInternal(accessToken).finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
