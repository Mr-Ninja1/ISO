import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });
    }

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
      console.warn("/api/tenants/:id/update: supabase getUser error", userError.message);
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createSupabaseWithBearer(token);

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("role", "ADMIN")
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, logoUrl } = await req.json();

    const patch: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) patch.name = name.trim();
    if (logoUrl !== undefined) patch.logo_url = logoUrl || null;

    if (Object.keys(patch).length === 0) {
      const { data: t } = await sb.from("tenants").select("*").eq("id", tenantId).single();
      return NextResponse.json({
        success: true,
        tenant: t
          ? {
              ...t,
              logoUrl: (t as Record<string, unknown>).logo_url,
            }
          : null,
      });
    }

    const { data: tenant, error: upErr } = await sb.from("tenants").update(patch).eq("id", tenantId).select("*").single();

    if (upErr || !tenant) {
      return NextResponse.json({ error: upErr?.message || "Update failed" }, { status: 500 });
    }

    const row = tenant as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      tenant: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logo_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
