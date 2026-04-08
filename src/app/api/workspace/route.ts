import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
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

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = url.searchParams.get("tenantSlug") || "";
    const requestedCategoryId = url.searchParams.get("categoryId");

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true, role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = membership.role === "ADMIN";

    const categories = await prisma.category.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    });

    let selectedCategoryId: string | null = requestedCategoryId;
    if (categories.length === 0) {
      selectedCategoryId = null;
    } else {
      const found = selectedCategoryId
        ? categories.some((c) => c.id === selectedCategoryId)
        : false;
      if (!selectedCategoryId || !found) {
        selectedCategoryId = categories[0].id;
      }
    }

    const templates = selectedCategoryId
      ? await prisma.formTemplate.findMany({
          where: { tenantId: tenant.id, categoryId: selectedCategoryId },
          orderBy: [{ updatedAt: "desc" }],
          select: { id: true, title: true, updatedAt: true, categoryId: true },
        })
      : [];

    return NextResponse.json({
      tenant,
      categories,
      selectedCategoryId,
      templates,
      isAdmin,
    });
  } catch (error: any) {
    console.error("/api/workspace GET error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
