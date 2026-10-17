"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { copyAuditReportSnapshot, writeAuditReportSnapshot } from "@/lib/client/auditReportSnapshot";
import {
  filterRowsToLivePending,
  readAuditsListCache,
  removeCachedAuditRow,
  upsertCachedAuditRow,
  writeAuditsListCache,
} from "@/lib/client/auditsListCache";
import {
  dbCountOutbox,
  dbDeleteOutbox,
  dbGetTemplate,
  dbListOutbox,
  dbListOutboxAll,
  dbMarkOutboxFailed,
} from "@/lib/client/formsDb";
import { clearClientSubmissionAttempt, readClientSubmissionId } from "@/lib/submissionMeta";
import { OFFLINE_MODE_CHANGED_EVENT } from "@/lib/client/connectivityEvents";
import { isAppOffline } from "@/lib/client/appOffline";
import { shouldPauseBackgroundWork, waitForInteractiveNavClear } from "@/lib/client/interactionGate";

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

/** Dispatched when the Dexie outbox or offline-submitted list changes. */
export const AUDIT_OUTBOX_CHANGED_EVENT = "iso-audit-outbox-changed";

export function notifyAuditOutboxChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUDIT_OUTBOX_CHANGED_EVENT));
}

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
  const submissionId = readClientSubmissionId(item.payload);
  const all = readOfflineSubmitted();
  const existingIdx = all.findIndex((row) => {
    if (row.queueId === item.queueId) return true;
    if (!submissionId) return false;
    return readClientSubmissionId(row.payload) === submissionId;
  });

  if (existingIdx >= 0) {
    const existing = all[existingIdx];
    const merged: OfflineSubmittedForm = {
      ...existing,
      queueId: item.queueId,
      tenantSlug: item.tenantSlug,
      templateId: item.templateId,
      templateTitle: item.templateTitle,
      payload: item.payload,
    };
    const next = [merged, ...all.filter((_, i) => i !== existingIdx)];
    writeOfflineSubmitted(next.slice(0, 300));
    return merged;
  }

  const next: OfflineSubmittedForm = {
    ...item,
    localId: `local_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    createdAt: Date.now(),
  };
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

export function removeOfflineSubmittedByClientSubmissionId(clientSubmissionId: string) {
  if (!clientSubmissionId.trim()) return;
  const all = readOfflineSubmitted();
  const next = all.filter((x) => readClientSubmissionId(x.payload) !== clientSubmissionId);
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
    return await dbCountOutbox();
  } catch {
    return 0;
  }
}

export async function getPendingAuditSyncCountAsync() {
  const [legacy, outbox] = await Promise.all([Promise.resolve(readQueue().length), countOutboxPending()]);
  return legacy + outbox;
}

/** Ids that should still show as Pending sync (still queued on this device). */
export async function getLivePendingAuditIds(tenantSlug: string): Promise<Set<string>> {
  const live = new Set<string>();
  if (!tenantSlug) return live;

  for (const form of getOfflineSubmittedForms(tenantSlug)) {
    live.add(`pending:${form.queueId}`);
  }
  for (const item of getAuditSyncQueueForTenant(tenantSlug)) {
    if (item.mode !== "submit") continue;
    live.add(item.auditId || `pending:${item.id}`);
  }
  try {
    const outbox = await dbListOutbox(tenantSlug);
    for (const item of outbox) {
      if (item.mode !== "submit") continue;
      live.add(item.auditId || `pending:${item.id}`);
    }
  } catch {
    // IndexedDB unavailable — sync lists above are still useful
  }
  return live;
}

/** Drop orphan pending:* rows from cache after a successful sync (or UI write-back races). */
export async function pruneStalePendingFromAuditsCache(
  userId: string | null,
  tenantSlug: string
): Promise<void> {
  if (!tenantSlug) return;
  const livePendingIds = await getLivePendingAuditIds(tenantSlug);
  const existing = readAuditsListCache(userId, tenantSlug);
  const rows = existing?.rows ?? [];
  const next = filterRowsToLivePending(rows, livePendingIds);
  if (next.length !== rows.length) {
    writeAuditsListCache(userId, tenantSlug, next, existing?.maxUpdatedAt ?? null);
  }
  if (userId) {
    const anon = readAuditsListCache(null, tenantSlug);
    if (anon?.rows?.length) {
      const anonNext = filterRowsToLivePending(anon.rows, livePendingIds);
      if (anonNext.length !== anon.rows.length) {
        writeAuditsListCache(null, tenantSlug, anonNext, anon.maxUpdatedAt);
      }
    }
  }
}

async function finalizeSuccessfulSubmit(
  item: {
    id: string;
    tenantSlug: string;
    templateId: string;
    payload: Record<string, unknown>;
    mode: QueueMode;
    auditId?: string | null;
  },
  serverAuditId: string,
  userId: string | null
) {
  removeOfflineSubmittedByQueueId(item.id);
  const submissionId = readClientSubmissionId(item.payload);
  if (submissionId) removeOfflineSubmittedByClientSubmissionId(submissionId);
  clearClientSubmissionAttempt(item.tenantSlug, item.templateId, item.auditId);
  notifyAuditOutboxChanged();
  const pendingId = `pending:${item.id}`;
  // FormRenderer writes pending rows under the signed-in user cache key.
  removeCachedAuditRow(userId, item.tenantSlug, pendingId);
  removeCachedAuditRow(null, item.tenantSlug, pendingId);
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
    schema: tpl?.schema || null,
  });
  const savedAt = new Date().toISOString();
  const serverRow = {
    id: serverAuditId,
    status: "SUBMITTED" as const,
    templateId: item.templateId,
    createdAt: savedAt,
    updatedAt: savedAt,
    submittedAt: savedAt,
    template: { title },
  };
  upsertCachedAuditRow(userId, item.tenantSlug, serverRow);
  if (userId) {
    upsertCachedAuditRow(null, item.tenantSlug, serverRow);
  }
  // Belt-and-suspenders: drop any orphan pending:* rows left by UI write-back races.
  await pruneStalePendingFromAuditsCache(userId, item.tenantSlug);
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
  },
  flushSignal?: AbortSignal,
) {
  const clientSubmissionId = readClientSubmissionId(item.payload);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  // Do not abort in-flight submits on interactive nav — that was killing sync right after
  // form save (navigate → markInteractiveNav → abort → forever "Pending sync").
  const abortIfOfflineOrHidden = () => {
    if (flushSignal?.aborted || isAppOffline()) {
      controller.abort();
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      controller.abort();
    }
  };
  const abortFromFlush = () => controller.abort();
  window.addEventListener("offline", abortFromFlush);
  window.addEventListener(OFFLINE_MODE_CHANGED_EVENT, abortIfOfflineOrHidden);
  document.addEventListener("visibilitychange", abortIfOfflineOrHidden);
  flushSignal?.addEventListener("abort", abortFromFlush, { once: true });

  let res: Response;
  try {
    abortIfOfflineOrHidden();
    res = await fetch(apiUrl("/api/audit/submit"), {
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
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    window.removeEventListener("offline", abortFromFlush);
    window.removeEventListener(OFFLINE_MODE_CHANGED_EVENT, abortIfOfflineOrHidden);
    document.removeEventListener("visibilitychange", abortIfOfflineOrHidden);
    flushSignal?.removeEventListener("abort", abortFromFlush);
  }

  if (!res.ok) {
    return { ok: false as const, status: res.status };
  }

  const json = (await res.json().catch(() => ({}))) as { auditId?: string };
  return { ok: true as const, auditId: typeof json.auditId === "string" ? json.auditId : "" };
}

async function flushAuditSyncQueueInternal(
  accessToken: string,
  signal?: AbortSignal,
  userId: string | null = null
) {
  if (!accessToken) return { processed: 0, remaining: 0 };

  let processed = 0;
  const outboxSubmissionIds = new Set<string>();
  const seenOutboxSubmissionIds = new Set<string>();

  try {
    const outbox = await dbListOutboxAll();
    for (const item of outbox) {
      if (signal?.aborted || isAppOffline()) break;
      // Wait for nav to settle — do NOT abandon the rest of the queue (that left old
      // forms stuck on Pending sync until the next submit woke flush again).
      if (shouldPauseBackgroundWork()) {
        await waitForInteractiveNavClear(4500);
        if (signal?.aborted || isAppOffline()) break;
      }
      const submissionId = readClientSubmissionId(item.payload);
      if (submissionId) {
        outboxSubmissionIds.add(submissionId);
        if (seenOutboxSubmissionIds.has(submissionId)) {
          await dbDeleteOutbox(item.id);
          removeOfflineSubmittedByQueueId(item.id);
          continue;
        }
        seenOutboxSubmissionIds.add(submissionId);
      }

      try {
        const result = await postQueuedSubmit(accessToken, item, signal);
        if (!result.ok) {
          await dbMarkOutboxFailed(item.id, `HTTP ${result.status}`);
          continue;
        }

        if (item.mode === "submit") {
          await finalizeSuccessfulSubmit(item, result.auditId, userId);
        }

        await dbDeleteOutbox(item.id);
        processed += 1;
        notifyAuditOutboxChanged();
      } catch (e: unknown) {
        if (signal?.aborted || isAppOffline()) break;
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

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index]!;
    if (signal?.aborted || isAppOffline()) {
      remaining.push(...queue.slice(index));
      break;
    }
    if (shouldPauseBackgroundWork()) {
      await waitForInteractiveNavClear(4500);
      if (signal?.aborted || isAppOffline()) {
        remaining.push(...queue.slice(index));
        break;
      }
    }
    const submissionId = readClientSubmissionId(item.payload);
    if (submissionId && outboxSubmissionIds.has(submissionId)) {
      processed += 1;
      continue;
    }

    try {
      const result = await postQueuedSubmit(accessToken, item, signal);
      if (!result.ok) {
        remaining.push(item);
        continue;
      }

      if (item.mode === "submit") {
        await finalizeSuccessfulSubmit(item, result.auditId, userId);
      }

      processed += 1;
    } catch {
      remaining.push(item);
      if (signal?.aborted || isAppOffline()) {
        remaining.push(...queue.slice(index + 1));
        break;
      }
    }
  }

  writeQueue(remaining);
  const outboxRemaining = await countOutboxPending();
  return { processed, remaining: remaining.length + outboxRemaining };
}

export async function flushAuditSyncQueue(
  accessToken: string,
  signal?: AbortSignal,
  userId: string | null = null
) {
  if (!accessToken) return { processed: 0, remaining: 0 };

  if (flushInFlight) return flushInFlight;

  flushInFlight = flushAuditSyncQueueInternal(accessToken, signal, userId).finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
