import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

export type SsrTenantRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
};

/** SSR / layout: load tenant header row without user session (same exposure as old slug lookup). */
export async function ssrTenantBySlug(slug: string): Promise<SsrTenantRow | null> {
  const svc = createServiceRoleSupabase();
  if (!svc) return null;
  const { data, error } = await svc.from("tenants").select("id,name,slug,logo_url,is_active").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    logoUrl: (data.logo_url as string | null) ?? null,
    isActive: data.is_active !== false,
  };
}

export async function ssrCategoriesForTenant(tenantId: string) {
  const svc = createServiceRoleSupabase();
  if (!svc) return [];
  const { data } = await svc
    .from("categories")
    .select("id,name,sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}

export async function ssrTemplatesForTenant(tenantId: string) {
  const svc = createServiceRoleSupabase();
  if (!svc) return [];
  const { data } = await svc
    .from("form_templates")
    .select("id,title,category_id,updated_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

/** Tenant + categories shape compatible with `CategoriesManager` (Prisma-like fields). */
export async function ssrTenantWithCategories(slug: string) {
  const tenant = await ssrTenantBySlug(slug);
  if (!tenant) return null;

  const svc = createServiceRoleSupabase();
  if (!svc) return null;

  const { data: full } = await svc.from("tenants").select("created_at, updated_at").eq("id", tenant.id).maybeSingle();

  const { data: catRows } = await svc
    .from("categories")
    .select("id, tenant_id, name, sort_order, created_at, updated_at")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const categories = (catRows || []).map((c) => ({
    id: c.id as string,
    tenantId: c.tenant_id as string,
    name: c.name as string,
    sortOrder: Number(c.sort_order ?? 0),
    createdAt: new Date(c.created_at as string),
    updatedAt: new Date(c.updated_at as string),
  }));

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logoUrl: tenant.logoUrl,
    createdAt: full?.created_at ? new Date(full.created_at as string) : new Date(),
    updatedAt: full?.updated_at ? new Date(full.updated_at as string) : new Date(),
    categories,
  };
}

export async function ssrAuditReportForPrint(auditId: string, tenantSlug: string) {
  const tenant = await ssrTenantBySlug(tenantSlug);
  if (!tenant) return null;

  const svc = createServiceRoleSupabase();
  if (!svc) return null;

  const { data: row, error } = await svc
    .from("audit_logs")
    .select("id, status, created_at, payload, template_id")
    .eq("id", auditId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (error || !row) return null;

  let templateTitle = "Form";
  let templateSchema: unknown = null;

  const templateId = row.template_id as string | null;
  if (templateId) {
    const { data: tplRow, error: tplError } = await svc
      .from("form_templates")
      .select("title, schema")
      .eq("id", templateId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    if (!tplError && tplRow) {
      templateTitle = (tplRow.title as string) || "Form";
      templateSchema = tplRow.schema;
    }
  }

  return {
    id: row.id as string,
    status: row.status as "DRAFT" | "SUBMITTED",
    createdAt: new Date(row.created_at as string),
    payload: row.payload,
    tenant: {
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      slug: tenant.slug,
    },
    template: {
      title: templateTitle,
      schema: templateSchema,
    },
  };
}

export async function ssrAuditRowsForTenant(tenantId: string) {
  const svc = createServiceRoleSupabase();
  if (!svc) return [];
  const { data, error } = await svc
    .from("audit_logs")
    .select("id,status,template_id,created_at,updated_at,submitted_at,form_templates(title)")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => {
    const rawTpl = row.form_templates;
    const tpl = (Array.isArray(rawTpl) ? rawTpl[0] : rawTpl) as { title?: string } | null | undefined;
    return {
      id: row.id as string,
      status: row.status as "DRAFT" | "SUBMITTED",
      templateId: row.template_id as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string) : null,
      template: { title: tpl?.title ?? "Form" },
    };
  });
}
