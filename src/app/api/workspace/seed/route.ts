import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

async function getUserFromToken(token: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  return user;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const tenantSlug = body?.tenantSlug || "";
    const namesInput = Array.isArray(body?.names) ? body.names : [];

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const normalized = namesInput
      .map((n: unknown) => (typeof n === "string" ? normalizeName(n) : ""))
      .filter((n: string) => Boolean(n));

    const names: string[] = Array.from(new Set<string>(normalized)).slice(0, 50);

    if (names.length === 0) {
      return NextResponse.json({ error: "At least one category is required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true, role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const result = await prisma.category.createMany({
      data: names.map((name, idx) => ({ tenantId: tenant.id, name, sortOrder: idx })),
      skipDuplicates: true,
    });

    return NextResponse.json({ createdCount: result.count });
  } catch (error: any) {
    console.error("/api/workspace/seed POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
