import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission, normalizeRole } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenantSlug") || "";
  if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      console.error("Capabilities check failed:", { error: me, hasMembership: !!membership, userId: user.id, tenantId: tenant.id });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = normalizeRole(membership.role);
    return NextResponse.json(
      {
        role,
        capabilities: {
          canAccessSettings: hasPermission(role, "settings.view"),
          canCreateForms: hasPermission(role, "forms.create"),
          canManageCategories: hasPermission(role, "categories.manage"),
          canManageStaff: hasPermission(role, "staff.manage"),
        },
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=90",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
