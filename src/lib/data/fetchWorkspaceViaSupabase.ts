import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWorkspacePayload,
  resolveSelectedWorkspaceCategoryId,
  type BuiltWorkspacePayload,
  type TemplateRowInput,
  type WorkspaceCategoryPayload,
  type WorkspaceTenantPayload,
} from "@/lib/workspacePayload";

/**
 * Workspace snapshot using Supabase greenfield tables:
 * tenants, tenant_members, categories, form_templates (snake_case columns).
 */
export async function fetchWorkspaceViaSupabase(
  supabase: SupabaseClient,
  tenantSlug: string,
  requestedCategoryId: string | null | undefined
): Promise<BuiltWorkspacePayload> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const { data: tenantRow, error: tenantErr } = await supabase
    .from("tenants")
    .select("id,name,slug,logo_url,is_active")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr) {
    const err = new Error(tenantErr.message) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  if (!tenantRow) {
    const err = new Error("Tenant not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  if ((tenantRow as Record<string, unknown>).is_active === false) {
    const err = new Error("This brand has been deactivated") as Error & {
      status?: number;
      code?: string;
    };
    err.status = 403;
    err.code = "TENANT_DEACTIVATED";
    throw err;
  }

  const tenantPayload: WorkspaceTenantPayload = {
    id: tenantRow.id as string,
    name: tenantRow.name as string,
    slug: tenantRow.slug as string,
    logoUrl: (tenantRow.logo_url as string | null) ?? null,
  };

  const { data: membership, error: memErr } = await supabase
    .from("tenant_members")
    .select("id,role")
    .eq("tenant_id", tenantPayload.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr || !membership) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const { data: categoryRows, error: catErr } = await supabase
    .from("categories")
    .select("id,name,sort_order")
    .eq("tenant_id", tenantPayload.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (catErr) {
    const err = new Error(catErr.message) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const categoryList: WorkspaceCategoryPayload[] = (categoryRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    sortOrder: Number(c.sort_order ?? 0),
  }));

  const selectedCategoryId = resolveSelectedWorkspaceCategoryId(categoryList, requestedCategoryId);

  let templateRowsForSelectedCategory: TemplateRowInput[] = [];
  if (selectedCategoryId) {
    const { data: tpls, error: tplErr } = await supabase
      .from("form_templates")
      .select("id,title,updated_at,category_id,schema")
      .eq("tenant_id", tenantPayload.id)
      .eq("category_id", selectedCategoryId)
      .order("updated_at", { ascending: false });

    if (tplErr) {
      const err = new Error(tplErr.message) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    templateRowsForSelectedCategory = (tpls ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      updatedAt: t.updated_at as string,
      categoryId: (t.category_id as string | null) ?? null,
      schema: t.schema,
    }));
  }

  return buildWorkspacePayload({
    tenant: tenantPayload,
    membershipRole: membership.role,
    categories: categoryList,
    requestedCategoryId,
    templateRowsForSelectedCategory,
  });
}
