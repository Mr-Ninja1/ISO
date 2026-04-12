import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  libraryTemplateId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
});

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

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { tenantSlug, libraryTemplateId, categoryId } = parsed.data;

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true, role: true },
    });

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "forms.import")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const libraryTemplate = await prisma.templateLibrary.findUnique({
      where: { id: libraryTemplateId },
      select: { id: true, title: true, schema: true },
    });

    if (!libraryTemplate) {
      return NextResponse.json({ error: "Library template not found" }, { status: 404 });
    }

    if (libraryTemplate.schema === null) {
      return NextResponse.json({ error: "Library template schema is missing" }, { status: 500 });
    }

    const created = await prisma.formTemplate.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryId ?? null,
        title: libraryTemplate.title,
        isStandard: true,
        schema: libraryTemplate.schema as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await recordActivity({
      tenantId: tenant.id,
      userId: user.id,
      action: "template.import",
      entityType: "FormTemplate",
      entityId: created.id,
      details: {
        libraryTemplateId,
        title: libraryTemplate.title,
        categoryId: categoryId ?? null,
      },
    });

    return NextResponse.json({ templateId: created.id });
  } catch (error: any) {
    console.error("/api/templates/import POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
