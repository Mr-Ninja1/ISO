import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenantSlug") || "";
  const auditId = url.searchParams.get("auditId") || "";

  if (!tenantSlug || !auditId) {
    return NextResponse.json({ error: "tenantSlug and auditId are required" }, { status: 400 });
  }

  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id, name, slug, logo_url").eq("slug", tenantSlug).maybeSingle();

  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "audit.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: row, error } = await sb
    .from("audit_logs")
    .select("id, status, created_at, payload, form_templates(title, schema)")
    .eq("id", auditId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: "Audit not found" }, { status: 404 });

  const rawTpl = row.form_templates;
  const tpl = (Array.isArray(rawTpl) ? rawTpl[0] : rawTpl) as { title?: string; schema?: unknown } | null | undefined;

  return NextResponse.json({
    audit: {
      id: row.id as string,
      status: row.status as string,
      createdAt: row.created_at as string,
      payload: row.payload,
      tenant: {
        name: tenant.name as string,
        slug: tenant.slug as string,
        logoUrl: (tenant.logo_url as string | null) ?? null,
      },
      template: {
        title: tpl?.title ?? "Form",
        schema: tpl?.schema ?? null,
      },
    },
  });
}
