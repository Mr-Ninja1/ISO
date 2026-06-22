"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { writeAuditTemplateCache, type AuditTemplatePayload } from "@/lib/client/auditTemplateCache";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

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

async function cacheTemplatesFromRows(
  tenantSlug: string,
  tenant: AuditTemplatePayload["tenant"],
  templates: Array<{
    id: string;
    title: string;
    schema: AuditTemplatePayload["template"]["schema"];
    updatedAt: string;
  }>
) {
  for (const template of templates) {
    writeAuditTemplateCache(tenantSlug, template.id, {
      tenant,
      template: {
        id: template.id,
        title: template.title,
        schema: template.schema,
        updatedAt: template.updatedAt,
      },
    });
  }

  markTenantTemplateBulkCached(tenantSlug);
  return templates.length;
}

/** Native app: download form schemas directly from Supabase. */
export async function cacheAllTenantTemplatesFromSupabase(
  supabase: SupabaseClient,
  tenantSlug: string
) {
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, slug, name, logo_url")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) {
    throw new Error("Tenant not found");
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    throw new Error("Unauthorized");
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipErr || !membership) {
    throw new Error("Forbidden");
  }

  const { data: allTemplates, error: templateErr } = await supabase
    .from("form_templates")
    .select("id, title, schema, updated_at")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (templateErr) {
    throw new Error(templateErr.message);
  }

  const templates = (allTemplates || [])
    .filter((row) => isLiveTemplateSchema(row.schema))
    .map((row) => ({
      id: row.id as string,
      title: row.title as string,
      schema: row.schema as AuditTemplatePayload["template"]["schema"],
      updatedAt: row.updated_at as string,
    }));

  if (!templates.length) {
    markTenantTemplateBulkCached(tenantSlug);
    return 0;
  }

  return cacheTemplatesFromRows(
    tenantSlug,
    {
      slug: tenant.slug as string,
      name: tenant.name as string,
      logoUrl: (tenant.logo_url as string | null) ?? null,
    },
    templates
  );
}

/** Downloads every form schema for a brand — API on web, Supabase on native. */
export async function cacheAllTenantTemplates(accessToken: string, tenantSlug: string) {
  if (isCapacitorNativeApp()) {
    const { createClient } = await import("@/lib/auth");
    return cacheAllTenantTemplatesFromSupabase(createClient(), tenantSlug);
  }
  return cacheAllTenantTemplatesFromApi(accessToken, tenantSlug);
}
