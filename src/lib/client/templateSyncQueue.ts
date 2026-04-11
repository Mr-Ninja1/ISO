"use client";

type TemplateSyncMode = "create" | "save-changes";

type TemplateSyncPayload = {
  tenantSlug: string;
  templateId?: string | null;
  title: string;
  categoryId: string | null;
  schema: {
    version: 1;
    title: string;
    sections: unknown[];
  };
};

export type TemplateSyncItem = {
  id: string;
  mode: TemplateSyncMode;
  payload: TemplateSyncPayload;
  queuedAt: number;
};

const KEY = "template-sync-queue:v1";

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

export async function flushTemplateSyncQueue(accessToken: string) {
  if (!accessToken) return { processed: 0, remaining: getPendingTemplateSyncCount() };

  const queue = compactQueue(readQueue());
  writeQueue(queue);
  if (!queue.length) return { processed: 0, remaining: 0 };

  let processed = 0;
  const remaining: TemplateSyncItem[] = [];
  const localIdToServerId = new Map<string, string>();

  for (const item of queue) {
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

      const endpoint =
        item.mode === "save-changes" ? "/api/templates/save-changes" : "/api/templates/create";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (isRetryableStatus(res.status)) {
          remaining.push(item);
        }
        continue;
      }

      if (item.mode === "create" && isLocalTemplateId(item.payload.templateId)) {
        const data = (await res.json().catch(() => ({}))) as { templateId?: string };
        if (item.payload.templateId && data?.templateId) {
          localIdToServerId.set(item.payload.templateId, data.templateId);
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
