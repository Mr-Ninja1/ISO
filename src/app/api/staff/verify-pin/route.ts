import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createSupabaseWithBearer(token);

    const { data: membershipRows, error: memErr } = await sb
      .from("tenant_members")
      .select("tenant_id, role, tenants(id, slug, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    const memberships = (membershipRows || []).map((r: Record<string, unknown>) => ({
      tenantId: r.tenant_id as string,
      role: r.role as string,
      tenant: r.tenants as { id: string; slug: string; name: string },
    }));

    if (!memberships.length) {
      return NextResponse.json({ ok: true, required: false, tenantSlug: null, staffName: null, staffEmail: user.email || null });
    }

    const adminMembership = memberships.find((m) => m.role === "ADMIN");
    if (adminMembership) {
      await recordActivity(sb, {
        tenantId: adminMembership.tenantId,
        userId: user.id,
        action: "auth.login",
        entityType: "TenantMember",
        entityId: user.id,
        details: {
          staffName: (user.user_metadata as any)?.full_name || user.email || "Admin",
          staffEmail: user.email || null,
          loginSource: "pin",
        },
      });

      return NextResponse.json({
        ok: true,
        required: false,
        tenantSlug: adminMembership.tenant.slug,
        tenantId: adminMembership.tenant.id,
        tenantName: adminMembership.tenant.name ?? null,
        staffName: (user.user_metadata as any)?.full_name || user.email || "Admin",
        staffEmail: user.email || null,
      });
    }

    const memberTenantIds = memberships.map((m) => m.tenantId);
    const { data: pinRows } = await sb
      .from("tenant_staff_pins")
      .select("tenant_id, full_name, email")
      .eq("user_id", user.id)
      .in("tenant_id", memberTenantIds);

    if (!pinRows?.length) {
      const fallback = memberships[0];
      return NextResponse.json({
        ok: true,
        required: false,
        tenantSlug: fallback.tenant.slug,
        tenantId: fallback.tenant.id,
        tenantName: fallback.tenant.name ?? null,
        staffName: user.email || "Staff",
        staffEmail: user.email || null,
      });
    }

    const matched = pinRows[0] as { tenant_id: string; full_name: string; email: string };
    const membership = memberships.find((m) => m.tenantId === matched.tenant_id) || memberships[0];

    await recordActivity(sb, {
      tenantId: membership.tenantId,
      userId: user.id,
      action: "auth.login",
      entityType: "TenantMember",
      entityId: user.id,
      details: {
        staffName: matched.full_name || matched.email || user.email || "Staff",
        staffEmail: matched.email || user.email || null,
        loginSource: "pin",
      },
    });

    return NextResponse.json({
      ok: true,
      required: false,
      tenantSlug: membership.tenant.slug,
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name ?? null,
      staffName: matched.full_name || matched.email || user.email || "Staff",
      staffEmail: matched.email || user.email || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
