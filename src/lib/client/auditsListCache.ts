export type CachedAuditRow = {
  id: string;
  status: "DRAFT" | "SUBMITTED";
  templateId: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  template: { title: string };
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
  maxUpdatedAt?: string | null
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
    if (typeof window !== "undefined") {
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
