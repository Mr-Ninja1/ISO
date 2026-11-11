import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function parseSince(raw: string | null) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenantSlug = (searchParams.get("tenantSlug") || "").trim();
  const since = parseSince(searchParams.get("since"));
  const statusParam = (searchParams.get("status") || "").trim().toUpperCase();
  const statusFilter =
    statusParam === "DRAFT" || statusParam === "SUBMITTED" ? (statusParam as "DRAFT" | "SUBMITTED") : null;
  const limitParam = Number(searchParams.get("limit") || "");
  const rowLimit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 200) : null;
  const offsetParam = Number(searchParams.get("offset") || "0");
  const offset =
    Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.min(Math.floor(offsetParam), 50_000) : 0;

  if (!tenantSlug) {
    return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });
  }

  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

  if (te || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "audit.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let q = sb
    .from("audit_logs")
    .select("id, status, template_id, created_at, updated_at, submitted_at, form_templates(title)", { count: "exact" })
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

  const { data: rows, error: listErr, count: liveCount } = await q;

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const rowList = rows || [];
  const serialized = rowList.map((row: Record<string, unknown>) => {
    const tpl = row.form_templates as { title?: string } | null | undefined;
    return {
      id: row.id as string,
      status: row.status as string,
      templateId: row.template_id as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string).toISOString() : null,
      template: { title: tpl?.title ?? "Form" },
      archived: false,
    };
  });

  let archiveRows: Array<Record<string, unknown>> = [];
  let archiveCountTotal = 0;
  if (!since && statusFilter !== "DRAFT") {
    const liveTotal = liveCount || 0;
    const archiveOffset = Math.max(0, offset - liveTotal);
    const svc = createServiceRoleSupabase();
    if (svc) {
      const { count } = await svc.from("audit_archives").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).is("restored_at", null);
      archiveCountTotal = count || 0;
      if (offset + pageSize > liveTotal) {
        const archiveLimit = Math.max(0, pageSize - serialized.length);
        const { data: archived } = await svc.from("audit_archives")
          .select("id,status,template_id,created_at,updated_at,submitted_at,template_title,restored_at")
          .eq("tenant_id", tenant.id).is("restored_at", null)
          .order("created_at", { ascending: false }).range(archiveOffset, archiveOffset + Math.max(0, archiveLimit - 1));
        archiveRows = (archived || []).map((row) => ({
          id: row.id as string, status: row.status as string, templateId: row.template_id as string,
          createdAt: new Date(row.created_at as string).toISOString(), updatedAt: new Date(row.updated_at as string).toISOString(),
          submittedAt: row.submitted_at ? new Date(row.submitted_at as string).toISOString() : null,
          template: { title: row.template_title || "Form" }, archived: true,
        }));
      }
    }
  }
  const hasMore = since ? false : offset + serialized.length + archiveRows.length < (liveCount || 0) + archiveCountTotal;
  const nextOffset = offset + serialized.length + archiveRows.length;

  const allSerialized = [...serialized, ...archiveRows];
  const maxUpdatedAt = allSerialized[0]?.updatedAt as string || since?.toISOString() || null;

  return NextResponse.json(
    {
      rows: allSerialized,
      maxUpdatedAt,
      serverTime: new Date().toISOString(),
      nextOffset,
      hasMore,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}
