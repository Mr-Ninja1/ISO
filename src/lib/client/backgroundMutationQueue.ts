"use client";

export type BackgroundMutation = {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  dedupeKey?: string;
  queuedAt: number;
};

const KEY = "background-mutation-queue:v1";

function readQueue(): BackgroundMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackgroundMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: BackgroundMutation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function getPendingBackgroundMutationCount() {
  return readQueue().length;
}

export function enqueueBackgroundMutation(
  item: Omit<BackgroundMutation, "id" | "queuedAt">
) {
  const id = `mut_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const next: BackgroundMutation = {
    ...item,
    id,
    queuedAt: Date.now(),
  };

  const queue = readQueue();
  const filtered = item.dedupeKey
    ? queue.filter((q) => q.dedupeKey !== item.dedupeKey)
    : queue;

  filtered.push(next);
  writeQueue(filtered);
  return next;
}

export async function flushBackgroundMutationQueue(accessToken: string) {
  if (!accessToken) {
    return { processed: 0, remaining: getPendingBackgroundMutationCount() };
  }

  const queue = readQueue();
  if (!queue.length) return { processed: 0, remaining: 0 };

  let processed = 0;
  const remaining: BackgroundMutation[] = [];

  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(item.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      });

      if (!res.ok) {
        if (isRetryableStatus(res.status)) {
          remaining.push(item);
        }
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
