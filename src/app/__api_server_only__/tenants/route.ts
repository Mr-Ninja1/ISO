import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
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
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError) {
      console.warn("/api/tenants: supabase getUser error", userError.message);
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createSupabaseWithBearer(token);
    const { data: rows, error } = await sb
      .from("tenant_members")
      .select("tenants(id, name, slug, logo_url)")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tenants = (rows || [])
      .map((r) => {
        const embedded = r.tenants as { id: string; name: string; slug: string; logo_url: string | null } | null | undefined | Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
        if (Array.isArray(embedded)) return embedded[0] ?? null;
        return embedded ?? null;
      })
      .filter((t): t is { id: string; name: string; slug: string; logo_url: string | null } => Boolean(t))
      .map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        logoUrl: t.logo_url,
      }));

    return NextResponse.json({ tenants });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
