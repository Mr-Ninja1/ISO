"use client";

import { apiUrl } from "@/lib/client/apiBase";
import { writeAuditTemplateCache, type AuditTemplatePayload } from "@/lib/client/auditTemplateCache";

const BULK_CACHE_KEY_PREFIX = "template-schemas-bulk-cached:v1:";

export function tenantTemplateBulkCacheKey(tenantSlug: string) {
  return `${BULK_CACHE_KEY_PREFIX}${tenantSlug}`;
}

/** True after a successful bulk download of every template schema for this brand. */
export function isTenantTemplateBulkCached(tenantSlug: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!tenantSlug) return false;
  try {
    const raw = localStorage.getItem(tenantTemplateBulkCacheKey(tenantSlug));
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= maxAgeMs;
  } catch {
    return false;
  }
}

export function markTenantTemplateBulkCached(tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    localStorage.setItem(tenantTemplateBulkCacheKey(tenantSlug), String(Date.now()));
  } catch {
    // ignore
  }
}

export function clearTenantTemplateBulkCached(tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    localStorage.removeItem(tenantTemplateBulkCacheKey(tenantSlug));
  } catch {
    // ignore
  }
}

type TemplatesCacheResponse = {
  tenant?: AuditTemplatePayload["tenant"];
  templates?: Array<{
    id: string;
    title: string;
    schema: AuditTemplatePayload["template"]["schema"];
    updatedAt: string;
  }>;
};

/** Downloads every form schema for a brand — required for instant offline opens. */
export async function cacheAllTenantTemplatesFromApi(accessToken: string, tenantSlug: string) {
  const templatesUrl = new URL(apiUrl("/api/audit/templates-cache"));
  templatesUrl.searchParams.set("tenantSlug", tenantSlug);

  const res = await fetch(templatesUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as TemplatesCacheResponse & { error?: string };
  if (!res.ok) {
    throw new Error(json?.error || `Template cache failed (${res.status})`);
  }

  if (!json.tenant || !Array.isArray(json.templates)) {
    markTenantTemplateBulkCached(tenantSlug);
    return 0;
  }

  for (const t of json.templates) {
    writeAuditTemplateCache(tenantSlug, t.id, {
      tenant: json.tenant,
      template: {
        id: t.id,
        title: t.title,
        schema: t.schema,
        updatedAt: t.updatedAt,
      },
    });
  }

  markTenantTemplateBulkCached(tenantSlug);
  return json.templates.length;
}
