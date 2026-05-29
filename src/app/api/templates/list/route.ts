import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { getBearerToken } from "@/lib/supabase/routeAuth";
import { mapTemplateRowsToPayload } from "@/lib/workspacePayload";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: tpls, error: tplErr } = await sb
      .from("form_templates")
      .select("id,title,updated_at,category_id,schema")
      .eq("tenant_id", tenant.id)
      .order("updated_at", { ascending: false });

    if (tplErr) {
      return NextResponse.json({ error: tplErr.message }, { status: 500 });
    }

    const rows = (tpls ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      updatedAt: t.updated_at as string,
      categoryId: (t.category_id as string | null) ?? null,
      schema: t.schema,
    }));

    const templates = mapTemplateRowsToPayload(rows);

    return NextResponse.json({ templates });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
