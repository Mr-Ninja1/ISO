import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { isLiveTemplateSchema } from "@/lib/templateVersioning";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z.object({
  tenantSlug: z.string().min(1),
  categoryId: z.string().uuid().optional(),
});

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
  const parsed = querySchema.safeParse({
    tenantSlug: url.searchParams.get("tenantSlug"),
    categoryId: url.searchParams.get("categoryId") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tenantSlug, categoryId } = parsed.data;
  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb
    .from("tenants")
    .select("id, slug, name, logo_url")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let q = sb
    .from("form_templates")
    .select("id, title, category_id, schema, updated_at")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (categoryId) {
    q = q.eq("category_id", categoryId);
  }

  const { data: allTemplates, error: tplErr } = await q;

  if (tplErr) {
    return NextResponse.json({ error: tplErr.message }, { status: 500 });
  }

  const templates = (allTemplates || []).filter((t) => isLiveTemplateSchema(t.schema)).map((t) => ({
    id: t.id,
    title: t.title,
    categoryId: t.category_id,
    schema: t.schema,
    updatedAt: t.updated_at,
  }));

  return NextResponse.json({
    tenant: {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logo_url,
    },
    templates,
  });
}
