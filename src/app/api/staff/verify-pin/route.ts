import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const memberships = await prisma.tenantMember.findMany({
      where: { userId: user.id },
      select: { tenantId: true, role: true, tenant: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (!memberships.length) {
      return NextResponse.json({ ok: true, required: false, tenantSlug: null, staffName: null, staffEmail: user.email || null });
    }

    const adminMembership = memberships.find((m) => m.role === "ADMIN");
    if (adminMembership) {
      return NextResponse.json({
        ok: true,
        required: false,
        tenantSlug: adminMembership.tenant.slug,
        staffName: (user.user_metadata as any)?.full_name || user.email || "Admin",
        staffEmail: user.email || null,
      });
    }

    const memberTenantIds = memberships.map((m) => m.tenantId);
    const rows = await prisma.tenantStaffPin.findMany({
      where: { userId: user.id, tenantId: { in: memberTenantIds } },
      select: { tenantId: true, fullName: true, email: true },
    });

    if (!rows.length) {
      const fallback = memberships[0];
      return NextResponse.json({
        ok: true,
        required: false,
        tenantSlug: fallback.tenant.slug,
        staffName: user.email || "Staff",
        staffEmail: user.email || null,
      });
    }

    const matched = rows[0];
    const membership = memberships.find((m) => m.tenantId === matched.tenantId) || memberships[0];

    return NextResponse.json({
      ok: true,
      required: false,
      tenantSlug: membership.tenant.slug,
      staffName: matched.fullName || matched.email || user.email || "Staff",
      staffEmail: matched.email || user.email || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
