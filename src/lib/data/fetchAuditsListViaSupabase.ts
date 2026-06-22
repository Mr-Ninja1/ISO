import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/roleGate";
import type { CachedAuditRow } from "@/lib/client/auditsListCache";

export type FetchAuditsListViaSupabaseOptions = {
  limit?: number;
  offset?: number;
  status?: "DRAFT" | "SUBMITTED";
  since?: string | null;
};

export type FetchAuditsListViaSupabaseResult = {
  rows: CachedAuditRow[];
  maxUpdatedAt: string | null;
  nextOffset: number | null;
  hasMore: boolean;
};

function parseSince(raw: string | null | undefined) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Saved forms list — direct Supabase path for native (mirrors /api/audit/list). */
export async function fetchAuditsListViaSupabase(
  supabase: SupabaseClient,
  tenantSlug: string,
  options: FetchAuditsListViaSupabaseOptions = {}
): Promise<FetchAuditsListViaSupabaseResult> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) {
    const err = new Error("Tenant not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const { data: membership, error: memErr } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memErr || !membership || !hasPermission(membership.role, "audit.view")) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const since = parseSince(options.since ?? null);
  const statusFilter = options.status ?? null;
  const limitParam = options.limit;
  const rowLimit = Number.isFinite(limitParam) && (limitParam ?? 0) > 0 ? Math.min(Math.floor(limitParam!), 200) : null;
  const offsetParam = options.offset ?? 0;
  const offset =
    Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.min(Math.floor(offsetParam), 50_000) : 0;

  let q = supabase
    .from("audit_logs")
    .select("id, status, template_id, created_at, updated_at, submitted_at, form_templates(title)")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  let pageSize = 50;
  if (since) {
    pageSize = rowLimit ?? 500;
    q = q.gt("updated_at", since.toISOString()).limit(pageSize);
  } else {
    pageSize = Math.min(rowLimit ?? 50, 200);
    const end = offset + pageSize - 1;
    q = q.range(offset, end);
  }

  const { data: rows, error: listErr } = await q;
  if (listErr) {
    const err = new Error(listErr.message) as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  const rowList = rows || [];
  const hasMore = !since && rowList.length === pageSize;
  const nextOffset = offset + rowList.length;

  const serialized: CachedAuditRow[] = rowList.map((row: Record<string, unknown>) => {
    const tpl = row.form_templates as { title?: string } | null | undefined;
    return {
      id: row.id as string,
      status: row.status as CachedAuditRow["status"],
      templateId: row.template_id as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string).toISOString() : null,
      template: { title: tpl?.title ?? "Form" },
    };
  });

  const maxUpdatedAt = serialized[0]?.updatedAt || since?.toISOString() || null;

  return { rows: serialized, maxUpdatedAt, nextOffset, hasMore };
}
