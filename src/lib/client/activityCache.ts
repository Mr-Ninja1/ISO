export type CachedActivityRow = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

type ActivityCacheEnvelope = {
  ts: number;
  rows: CachedActivityRow[];
};

function activityCacheKey(tenantSlug: string) {
  return `activity-cache:v1:${tenantSlug}`;
}

export function readCachedActivityRows(tenantSlug: string): CachedActivityRow[] {
  if (!tenantSlug) return [];
  try {
    const raw = localStorage.getItem(activityCacheKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityCacheEnvelope;
    if (!parsed || !Array.isArray(parsed.rows)) return [];
    return parsed.rows;
  } catch {
    return [];
  }
}

export function writeCachedActivityRows(tenantSlug: string, rows: CachedActivityRow[]) {
  if (!tenantSlug) return;
  try {
    const payload: ActivityCacheEnvelope = { ts: Date.now(), rows };
    localStorage.setItem(activityCacheKey(tenantSlug), JSON.stringify(payload));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("activity-cache-updated", {
          detail: { tenantSlug },
        })
      );
    }
  } catch {
    // ignore cache errors
  }
}
