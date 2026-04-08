"use client";

import type { FormSchemaV1 } from "@/types/forms";

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
    const parsed = parseCacheEnvelope(localStorage.getItem(auditTemplateCacheKey(tenantSlug, templateId)));
    if (!parsed) return false;
    return Date.now() - parsed.ts <= TEMPLATE_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

export function readAuditTemplateCache(tenantSlug: string, templateId: string): AuditTemplatePayload | null {
  try {
    const parsed = parseCacheEnvelope(localStorage.getItem(auditTemplateCacheKey(tenantSlug, templateId)));
    if (!parsed) return null;
    // Stale-while-revalidate: return cached payload immediately to keep open latency low.
    // Callers can check freshness via isAuditTemplateCacheFresh and revalidate in background.
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeAuditTemplateCache(tenantSlug: string, templateId: string, data: AuditTemplatePayload) {
  try {
    const payload: CacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(auditTemplateCacheKey(tenantSlug, templateId), JSON.stringify(payload));
  } catch {
    // ignore local storage quota errors
  }
}
