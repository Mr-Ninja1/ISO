import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const tenantId = body?.tenantId;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId, userId: user.id },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasPermission(membership.role, "categories.manage")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const category = await prisma.category.create({
      data: {
        tenantId,
        name,
        sortOrder: 0,
      },
    });

    await recordActivity({
      tenantId,
      userId: user.id,
      action: "category.create",
      entityType: "Category",
      entityId: category.id,
      details: { name: category.name },
    });

    return NextResponse.json(category);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
