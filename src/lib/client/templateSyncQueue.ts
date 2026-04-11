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
  const id = `tmpl_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const next: TemplateSyncItem = {
    ...item,
    id,
    queuedAt: Date.now(),
  };

  const queue = readQueue();
  queue.push(next);
  writeQueue(queue);
  return next;
}

export async function flushTemplateSyncQueue(accessToken: string) {
  if (!accessToken) return { processed: 0, remaining: getPendingTemplateSyncCount() };

  const queue = readQueue();
  if (!queue.length) return { processed: 0, remaining: 0 };

  let processed = 0;
  const remaining: TemplateSyncItem[] = [];

  for (const item of queue) {
    try {
      const endpoint =
        item.mode === "save-changes" ? "/api/templates/save-changes" : "/api/templates/create";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(item.payload),
      });

      if (!res.ok) {
        remaining.push(item);
        continue;
      }

      processed += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { processed, remaining: remaining.length };
}
