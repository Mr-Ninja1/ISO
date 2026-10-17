export type CachedAuditRow = {
  id: string;
  status: "DRAFT" | "SUBMITTED";
  templateId: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  template: { title: string };
  /** Saved on device; may still be syncing to the server. */
  devicePending?: boolean;
};

type AuditsListCacheEnvelope = {
  ts: number;
  maxUpdatedAt: string | null;
  rows: CachedAuditRow[];
};

const MAX_ROWS = 2000;

function cacheKey(userId: string | null, tenantSlug: string) {
  return `audits-list-cache:v1:${userId || "anon"}:${tenantSlug}`;
}

export function readAuditsListCache(userId: string | null, tenantSlug: string): AuditsListCacheEnvelope | null {
  if (!tenantSlug) return null;
  try {
    const raw = localStorage.getItem(cacheKey(userId, tenantSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuditsListCacheEnvelope;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuditsListCache(
  userId: string | null,
  tenantSlug: string,
  rows: CachedAuditRow[],
  maxUpdatedAt?: string | null,
  options?: { broadcast?: boolean }
) {
  if (!tenantSlug) return;
  try {
    const capped = rows
      .slice()
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, MAX_ROWS);

    const derivedMax = capped[0]?.updatedAt || null;
    const payload: AuditsListCacheEnvelope = {
      ts: Date.now(),
      maxUpdatedAt: maxUpdatedAt || derivedMax,
      rows: capped,
    };
    localStorage.setItem(cacheKey(userId, tenantSlug), JSON.stringify(payload));
    if (options?.broadcast !== false && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("audits-cache-updated", {
          detail: { tenantSlug },
        })
      );
    }
  } catch {
    // ignore localStorage quota/serialization errors
  }
}

export function upsertCachedAuditRow(userId: string | null, tenantSlug: string, row: CachedAuditRow) {
  if (!tenantSlug) return;
  const existing = readAuditsListCache(userId, tenantSlug);
  const merged = mergeAuditsRows(existing?.rows ?? [], [row]);
  writeAuditsListCache(userId, tenantSlug, merged, existing?.maxUpdatedAt ?? null);
}

/** Drop a row (e.g. `pending:<outboxId>`) from the device list cache. */
export function removeCachedAuditRow(userId: string | null, tenantSlug: string, auditId: string) {
  if (!tenantSlug || !auditId) return;
  const existing = readAuditsListCache(userId, tenantSlug);
  if (!existing?.rows?.length) return;
  const next = existing.rows.filter((row) => row.id !== auditId);
  if (next.length === existing.rows.length) return;
  writeAuditsListCache(userId, tenantSlug, next, existing.maxUpdatedAt);
}

export function isPendingAuditCacheId(auditId: string) {
  return auditId.startsWith("pending:") || auditId.startsWith("local-draft:");
}

/**
 * Merge cache into UI rows while dropping pending ids that the cache no longer has.
 * Plain merge-by-id never deletes, which resurrected "Pending sync" ghosts after a successful push.
 */
export function mergeAuditsRowsDroppingStalePending(
  current: CachedAuditRow[],
  cached: CachedAuditRow[]
): CachedAuditRow[] {
  const cachedIds = new Set(cached.map((row) => row.id));
  const withoutStalePending = current.filter((row) => {
    if (!isPendingAuditCacheId(row.id)) return true;
    return cachedIds.has(row.id);
  });
  return mergeAuditsRows(withoutStalePending, cached);
}

/** Keep only pending rows whose ids are still live (still in outbox / offline queue). */
export function filterRowsToLivePending(
  rows: CachedAuditRow[],
  livePendingIds: Set<string>
): CachedAuditRow[] {
  return rows.filter((row) => {
    if (!isPendingAuditCacheId(row.id)) return true;
    return livePendingIds.has(row.id);
  });
}

export function mergeAuditsRows(base: CachedAuditRow[], incoming: CachedAuditRow[]) {
  if (!incoming.length) return base;
  const byId = new Map<string, CachedAuditRow>();

  for (const row of base) {
    byId.set(row.id, row);
  }

  for (const row of incoming) {
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    const prevTs = +new Date(prev.updatedAt);
    const nextTs = +new Date(row.updatedAt);
    if (nextTs >= prevTs) {
      byId.set(row.id, row);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, MAX_ROWS);
}
