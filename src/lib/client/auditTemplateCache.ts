"use client";

import type { FormSchemaV1 } from "@/types/forms";
import { dbGetTemplate, dbPutTemplate } from "@/lib/client/formsDb";

export type AuditTemplatePayload = {
  tenant: {
    slug: string;
    name: string;
    logoUrl: string | null;
  };
  template: {
    id: string;
    title: string;
    schema: FormSchemaV1;
    updatedAt: string;
  };
};

type CacheEnvelope = {
  ts: number;
  data: AuditTemplatePayload;
};

const TEMPLATE_CACHE_TTL_MS = 30 * 60 * 1000;
const LOCAL_TEMPLATE_CACHE_MAX_CHARS = 96 * 1024;
const parsedCache = new Map<string, { raw: string; data: AuditTemplatePayload }>();

export function auditTemplateCacheKey(tenantSlug: string, templateId: string) {
  return `audit-template-cache:v1:${tenantSlug}:${templateId}`;
}

function parseCacheEnvelope(raw: string | null): CacheEnvelope | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as CacheEnvelope;
  if (!parsed?.data || typeof parsed.ts !== "number") return null;
  return parsed;
}

export function isAuditTemplateCacheFresh(tenantSlug: string, templateId: string): boolean {
  try {
    const key = auditTemplateCacheKey(tenantSlug, templateId);
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > LOCAL_TEMPLATE_CACHE_MAX_CHARS) {
      if (raw) removeAuditTemplateLocalCache(tenantSlug, templateId);
      return false;
    }
    const parsed = parseCacheEnvelope(raw);
    if (!parsed) return false;
    return Date.now() - parsed.ts <= TEMPLATE_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/** Freshness check for bulk cached forms, whose full schemas live in IndexedDB. */
export async function isAuditTemplateCacheFreshAsync(tenantSlug: string, templateId: string): Promise<boolean> {
  if (isAuditTemplateCacheFresh(tenantSlug, templateId)) return true;
  try {
    const row = await dbGetTemplate(tenantSlug, templateId);
    return Boolean(row && Date.now() - row.cachedAt <= TEMPLATE_CACHE_TTL_MS);
  } catch {
    return false;
  }
}

export function readAuditTemplateCache(tenantSlug: string, templateId: string): AuditTemplatePayload | null {
  const key = auditTemplateCacheKey(tenantSlug, templateId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      parsedCache.delete(key);
      return null;
    }
    if (raw.length > LOCAL_TEMPLATE_CACHE_MAX_CHARS) {
      removeAuditTemplateLocalCache(tenantSlug, templateId);
      return null;
    }
    const cached = parsedCache.get(key);
    if (cached?.raw === raw) return cached.data;
    const parsed = parseCacheEnvelope(raw);
    if (!parsed) return null;
    // Stale-while-revalidate: return cached payload immediately to keep open latency low.
    // Callers can check freshness via isAuditTemplateCacheFresh and revalidate in background.
    parsedCache.set(key, { raw, data: parsed.data });
    return parsed.data;
  } catch {
    return null;
  }
}

export function removeAuditTemplateLocalCache(tenantSlug: string, templateId: string) {
  const key = auditTemplateCacheKey(tenantSlug, templateId);
  parsedCache.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

/** IndexedDB read (durable). Use after mount (async). */
export async function readAuditTemplateCacheAsync(tenantSlug: string, templateId: string): Promise<AuditTemplatePayload | null> {
  try {
    const row = await dbGetTemplate(tenantSlug, templateId);
    if (!row) return null;
    return {
      tenant: { slug: tenantSlug, name: row.tenantName, logoUrl: row.tenantLogoUrl ?? null },
      template: {
        id: templateId,
        title: row.title,
        schema: row.schema,
        updatedAt: row.updatedAt,
      },
    };
  } catch {
    return null;
  }
}

export function writeAuditTemplateCache(tenantSlug: string, templateId: string, data: AuditTemplatePayload) {
  try {
    const payload: CacheEnvelope = { ts: Date.now(), data };
    const key = auditTemplateCacheKey(tenantSlug, templateId);
    const raw = JSON.stringify(payload);
    if (raw.length > LOCAL_TEMPLATE_CACHE_MAX_CHARS) {
      removeAuditTemplateLocalCache(tenantSlug, templateId);
    } else {
      localStorage.setItem(key, raw);
      parsedCache.set(key, { raw, data });
    }
  } catch {
    // ignore local storage quota errors
  }

  // Best-effort durable write; does not block UI.
  void dbPutTemplate({
    tenantSlug,
    templateId,
    updatedAt: data.template.updatedAt,
    title: data.template.title,
    schema: data.template.schema as FormSchemaV1,
    tenantName: data.tenant.name,
    tenantLogoUrl: data.tenant.logoUrl ?? null,
  });
}

/** Store a form for offline use without synchronously serializing it into localStorage. */
export async function writeAuditTemplateCacheDurable(
  tenantSlug: string,
  templateId: string,
  data: AuditTemplatePayload,
) {
  await dbPutTemplate({
    tenantSlug,
    templateId,
    updatedAt: data.template.updatedAt,
    title: data.template.title,
    schema: data.template.schema as FormSchemaV1,
    tenantName: data.tenant.name,
    tenantLogoUrl: data.tenant.logoUrl ?? null,
  });
  // A previous localStorage snapshot must not mask this newer durable schema.
  removeAuditTemplateLocalCache(tenantSlug, templateId);
}
