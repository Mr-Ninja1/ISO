import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError) {
      console.warn("/api/tenants/create: supabase getUser error", userError.message);
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not set. Brand creation requires the service role on the server.",
        },
        { status: 500 }
      );
    }

    let slug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    if (!slug) {
      slug = `brand-${Math.random().toString(36).slice(2, 8)}`;
    }

    let attempt = 0;
    let uniqueSlug = slug;
    while (attempt < 10) {
      const { data: existing } = await svc.from("tenants").select("id").eq("slug", uniqueSlug).maybeSingle();
      if (!existing) break;
      uniqueSlug = `${slug}-${++attempt}`;
    }

    const { data: tenant, error: tenantErr } = await svc
      .from("tenants")
      .insert({ name, slug: uniqueSlug, is_active: true })
      .select("id, slug")
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: tenantErr?.message || "Failed to create tenant" }, { status: 500 });
    }

    const { error: memberErr } = await svc.from("tenant_members").insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: "ADMIN",
    });

    if (memberErr) {
      await svc.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    return NextResponse.json({ slug: tenant.slug, tenantId: tenant.id, isActive: true, mode: "trial" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create tenant";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
