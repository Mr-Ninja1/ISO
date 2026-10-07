import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantSlug = new URL(req.url).searchParams.get("tenantSlug") || "";
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: membershipError } = await supabase
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [{ data: templates, error: templateError }, { data: categories, error: categoryError }] = await Promise.all([
      supabase
        .from("form_templates")
        .select("id,updated_at,category_id")
        .eq("tenant_id", tenant.id)
        .order("id", { ascending: true }),
      supabase
        .from("categories")
        .select("id,sort_order,name")
        .eq("tenant_id", tenant.id)
        .order("id", { ascending: true }),
    ]);
    if (templateError) throw templateError;
    if (categoryError) throw categoryError;

    const signatureInput = JSON.stringify({
      categories: (categories || []).map((category) => [category.id, category.name, category.sort_order]),
      templates: (templates || []).map((template) => [template.id, template.category_id, template.updated_at]),
    });
    const signature = createHash("sha256").update(signatureInput).digest("hex");

    return NextResponse.json(
      { signature },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } }
    );
  } catch (error) {
    console.error("/api/workspace/changes GET error", error);
    return NextResponse.json({ error: "Unable to check workspace changes" }, { status: 500 });
  }
}
