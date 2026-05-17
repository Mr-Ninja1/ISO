import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

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
    .select("id, status, template_id, created_at, updated_at, submitted_at, form_templates(title)")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (statusFilter) {
    q = q.eq("status", statusFilter);
  }

  if (since) {
    q = q.gt("updated_at", since.toISOString());
    q = q.limit(rowLimit ?? 1000);
  } else if (rowLimit) {
    q = q.limit(rowLimit);
  } else {
    q = q.limit(2000);
  }

  const { data: rows, error: listErr } = await q;

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const serialized = (rows || []).map((row: Record<string, unknown>) => {
    const tpl = row.form_templates as { title?: string } | null | undefined;
    return {
      id: row.id as string,
      status: row.status as string,
      templateId: row.template_id as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      submittedAt: row.submitted_at ? new Date(row.submitted_at as string).toISOString() : null,
      template: { title: tpl?.title ?? "Form" },
    };
  });

  const maxUpdatedAt = serialized[0]?.updatedAt || since?.toISOString() || null;

  return NextResponse.json(
    {
      rows: serialized,
      maxUpdatedAt,
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}
