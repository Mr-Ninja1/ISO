"use client";

import { apiUrl } from "@/lib/client/apiBase";
import {
  mergeAuditsRows,
  readAuditsListCache,
  writeAuditsListCache,
  type CachedAuditRow,
} from "@/lib/client/auditsListCache";

export type FetchAuditsListOptions = {
  /** Max rows from server (default: server cap when omitted). */
  limit?: number;
  /** Pagination offset (ignored when `since` is set). */
  offset?: number;
  /** Only DRAFT or SUBMITTED rows. */
  status?: "DRAFT" | "SUBMITTED";
  /** Incremental sync — only rows updated after this ISO timestamp. */
  since?: string | null;
  /** Merge into existing device cache instead of replacing. */
  merge?: boolean;
};

export type FetchAuditsListResult = {
  rows: CachedAuditRow[];
  maxUpdatedAt: string | null;
  mergedIntoCache: boolean;
  nextOffset: number | null;
  hasMore: boolean;
};

/** Pull saved forms from the server and optionally merge into local cache. */
export async function fetchAndCacheAuditsList(
  accessToken: string,
  userId: string | null,
  tenantSlug: string,
  options: FetchAuditsListOptions = {}
): Promise<FetchAuditsListResult> {
  const url = new URL(apiUrl("/api/audit/list"));
  url.searchParams.set("tenantSlug", tenantSlug);
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  if (typeof options.offset === "number" && options.offset > 0) {
    url.searchParams.set("offset", String(options.offset));
  }
  if (options.status) url.searchParams.set("status", options.status);
  if (options.since) url.searchParams.set("since", options.since);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    rows?: CachedAuditRow[];
    maxUpdatedAt?: string | null;
    error?: string;
    nextOffset?: number;
    hasMore?: boolean;
  };
  if (!res.ok) {
    const detail = typeof data?.error === "string" ? data.error : "";
    if (res.status === 404) {
      throw new Error(
        detail === "Tenant not found"
          ? "Could not load saved forms — brand not found on server. Re-open workspace and try again."
          : "Could not load saved forms — list API unavailable (404). Device copies below still work."
      );
    }
    throw new Error(detail || `Failed to load saved forms (${res.status})`);
  }

  const incoming = Array.isArray(data.rows) ? data.rows : [];
  const maxUpdatedAt = data.maxUpdatedAt || null;
  const nextOffset = typeof data.nextOffset === "number" ? data.nextOffset : null;
  const hasMore = Boolean(data.hasMore);

  if (options.merge !== false) {
    const existing = readAuditsListCache(userId, tenantSlug);
    const merged = existing?.rows?.length ? mergeAuditsRows(existing.rows, incoming) : incoming;
    writeAuditsListCache(userId, tenantSlug, merged, maxUpdatedAt ?? existing?.maxUpdatedAt ?? null);
    return { rows: merged, maxUpdatedAt, mergedIntoCache: true, nextOffset, hasMore };
  }

  writeAuditsListCache(userId, tenantSlug, incoming, maxUpdatedAt);
  return { rows: incoming, maxUpdatedAt, mergedIntoCache: true, nextOffset, hasMore };
}

/** Light first-time prefetch: recent drafts only (not entire history). */
export async function prefetchRecentDraftAudits(
  accessToken: string,
  userId: string | null,
  tenantSlug: string,
  limit = 40
) {
  try {
    return await fetchAndCacheAuditsList(accessToken, userId, tenantSlug, {
      limit,
      status: "DRAFT",
      merge: true,
    });
  } catch {
    return {
      rows: readAuditsListCache(userId, tenantSlug)?.rows ?? [],
      maxUpdatedAt: null,
      mergedIntoCache: false,
      nextOffset: null,
      hasMore: false,
    };
  }
}
