"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { patchWorkspaceTemplateCaches } from "@/lib/client/workspaceCache";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";
type TemplateSyncMode = "create" | "save-changes" | "update-seed-rows";

export type TemplateSeedRowPatch = {
  sectionId: string;
  seedRows?: Array<Record<string, string | number | boolean>>;
};

type TemplateSyncPayload = {
  tenantSlug: string;
  templateId?: string | null;
  title?: string;
  categoryId?: string | null;
  schema?: {
    version: 1;
    title: string;
    sections: unknown[];
  };
  sections?: TemplateSeedRowPatch[];
};

export type TemplateSyncItem = {
  id: string;
  mode: TemplateSyncMode;
  payload: TemplateSyncPayload;
  queuedAt: number;
};

const KEY = "template-sync-queue:v1";
const QUEUE_REQUEST_TIMEOUT_MS = 30_000;

function mergeSeedRowPatches(
  earlier: TemplateSeedRowPatch[] = [],
  later: TemplateSeedRowPatch[] = [],
): TemplateSeedRowPatch[] {
  const bySection = new Map<string, TemplateSeedRowPatch>();
  for (const patch of [...earlier, ...later]) bySection.set(patch.sectionId, patch);
  return [...bySection.values()];
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isLocalTemplateId(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith("local_tmpl_");
}

function compactQueue(items: TemplateSyncItem[]) {
  const byLocalCreate = new Map<string, TemplateSyncItem>();
  const byTemplateUpdate = new Map<string, TemplateSyncItem>();
  const passthrough: TemplateSyncItem[] = [];

  for (const item of items) {
    const templateId = item.payload.templateId || "";

    if (item.mode === "create" && isLocalTemplateId(templateId)) {
      byLocalCreate.set(`${item.payload.tenantSlug}:${templateId}`, item);
      continue;
    }

    if (item.mode === "save-changes" && templateId && !isLocalTemplateId(templateId)) {
      byTemplateUpdate.set(`${item.payload.tenantSlug}:${templateId}`, item);
      continue;
    }

    if (item.mode === "update-seed-rows" && templateId && !isLocalTemplateId(templateId)) {
      const key = `${item.payload.tenantSlug}:${templateId}:seed-rows`;
      const previous = byTemplateUpdate.get(key);
      byTemplateUpdate.set(
        key,
        previous
          ? {
              ...item,
              queuedAt: previous.queuedAt,
              payload: {
                ...item.payload,
                sections: mergeSeedRowPatches(previous.payload.sections, item.payload.sections),
              },
            }
          : item,
      );
      continue;
    }

    passthrough.push(item);
  }

  return [...passthrough, ...byLocalCreate.values(), ...byTemplateUpdate.values()].sort(
    (a, b) => a.queuedAt - b.queuedAt
  );
}

function readQueue(): TemplateSyncItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TemplateSyncItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: TemplateSyncItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getPendingTemplateSyncCount() {
  return readQueue().length;
}

export function enqueueTemplateSync(item: Omit<TemplateSyncItem, "id" | "queuedAt">) {
  const queue = readQueue();
  const templateId = item.payload.templateId || null;

  // Merge edits into pending create for the same local template to avoid duplicates.
  if (isLocalTemplateId(templateId)) {
    const idx = queue.findIndex(
      (q) =>
        q.mode === "create" &&
        q.payload.tenantSlug === item.payload.tenantSlug &&
        q.payload.templateId === templateId
    );

    if (idx >= 0) {
      const existing = queue[idx];
      queue[idx] = {
        ...existing,
        payload: {
          ...existing.payload,
          title: item.payload.title,
          categoryId: item.payload.categoryId,
          schema: item.payload.schema,
        },
      };
      writeQueue(queue);
      return queue[idx];
    }
  }

  // Keep only the latest update per real template while offline.
  if (item.mode === "save-changes" && templateId && !isLocalTemplateId(templateId)) {
    const filtered = queue.filter(
      (q) =>
        !(
          q.mode === "save-changes" &&
          q.payload.tenantSlug === item.payload.tenantSlug &&
          q.payload.templateId === templateId
        )
    );
    writeQueue(filtered);
  }

  if (item.mode === "update-seed-rows" && templateId && !isLocalTemplateId(templateId)) {
    const idx = queue.findIndex(
      (q) =>
        q.mode === "update-seed-rows" &&
        q.payload.tenantSlug === item.payload.tenantSlug &&
        q.payload.templateId === templateId
    );
    if (idx >= 0) {
      const existing = queue[idx];
      queue[idx] = {
        ...existing,
        payload: {
          ...item.payload,
          sections: mergeSeedRowPatches(existing.payload.sections, item.payload.sections),
        },
      };
      writeQueue(queue);
      return queue[idx];
    }
  }

  const id = `tmpl_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const next: TemplateSyncItem = {
    ...item,
    id,
    queuedAt: Date.now(),
  };

  const latest = readQueue();
  latest.push(next);
  writeQueue(latest);
  return next;
}

export async function flushTemplateSyncQueue(accessToken: string, signal?: AbortSignal) {
  if (!accessToken) return { processed: 0, remaining: getPendingTemplateSyncCount() };

  const queue = compactQueue(readQueue());
  writeQueue(queue);
  if (!queue.length) return { processed: 0, remaining: 0 };
  const queuedAtStart = new Map(queue.map((item) => [item.id, item]));

  let processed = 0;
  const remaining: TemplateSyncItem[] = [];
  const localIdToServerId = new Map<string, string>();

  for (let index = 0; index < queue.length; index += 1) {
    if (signal?.aborted) {
      remaining.push(...queue.slice(index));
      break;
    }
    const item = queue[index]!;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), QUEUE_REQUEST_TIMEOUT_MS);
    try {
      let payload = item.payload;

      if (
        item.mode === "save-changes" &&
        isLocalTemplateId(payload.templateId) &&
        payload.templateId &&
        localIdToServerId.has(payload.templateId)
      ) {
        payload = {
          ...payload,
          templateId: localIdToServerId.get(payload.templateId) || payload.templateId,
        };
      }

      if (item.mode === "save-changes" && isLocalTemplateId(payload.templateId)) {
        // Still waiting for the related create to resolve.
        remaining.push(item);
        continue;
      }

      const endpoint = apiUrl(
        item.mode === "update-seed-rows"
          ? "/api/templates/update-seed-rows"
          : item.mode === "save-changes"
            ? "/api/templates/save-changes"
            : "/api/templates/create"
      );

      // Let the current write finish when navigation starts. Aborting a create after
      // the server commits but before its response arrives could create a duplicate.
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (isRetryableStatus(res.status)) {
          remaining.push(item);
        }
        continue;
      }

      if (item.mode === "update-seed-rows") {
        requestWorkspaceRevalidate(item.payload.tenantSlug);
      } else if (item.mode === "create" && isLocalTemplateId(item.payload.templateId)) {
        const data = (await res.json().catch(() => ({}))) as { templateId?: string };
        if (item.payload.templateId && data?.templateId) {
          localIdToServerId.set(item.payload.templateId, data.templateId);
          patchWorkspaceTemplateCaches(
            null,
            item.payload.tenantSlug,
            {
              id: data.templateId,
              title: item.payload.title || "",
              categoryId: item.payload.categoryId ?? null,
              updatedAt: new Date().toISOString(),
            },
            { replaceLocalId: item.payload.templateId }
          );
          requestWorkspaceRevalidate(item.payload.tenantSlug);
        }
      } else if (item.mode === "save-changes" && item.payload.templateId) {
        patchWorkspaceTemplateCaches(null, item.payload.tenantSlug, {
          id: String(payload.templateId),
          title: item.payload.title || "",
          categoryId: item.payload.categoryId ?? null,
          updatedAt: new Date().toISOString(),
        });
        requestWorkspaceRevalidate(item.payload.tenantSlug);
      }

      processed += 1;
    } catch {
      remaining.push(item);
      if (signal?.aborted) {
        remaining.push(...queue.slice(index + 1));
        break;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  // Enqueues can happen while a request is in flight. Reconcile by item ID so
  // this flush cannot overwrite a newer patch or a newly queued template edit.
  const latestById = new Map(readQueue().map((item) => [item.id, item]));
  const keepById = new Map<string, TemplateSyncItem>();
  for (const item of remaining) {
    keepById.set(item.id, latestById.get(item.id) || item);
  }
  for (const [id, latest] of latestById) {
    const started = queuedAtStart.get(id);
    if (!started || JSON.stringify(started) !== JSON.stringify(latest)) {
      keepById.set(id, latest);
    }
  }
  const reconciled = [...keepById.values()].sort((a, b) => a.queuedAt - b.queuedAt);
  writeQueue(reconciled);
  return { processed, remaining: reconciled.length };
}
