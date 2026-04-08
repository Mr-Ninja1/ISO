import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { normalizeTemplateSchema, withTemplateSchemaMeta } from "@/lib/templateVersioning";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  title: z.string().min(1),
  categoryId: z.string().uuid().nullable().optional(),
  schema: z.any(),
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
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { tenantSlug, title, categoryId, schema } = parsed.data;

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true },
    });

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true },
    });

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    let normalized;
    try {
      normalized = normalizeTemplateSchema(schema, title);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Invalid schema" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const first = await tx.formTemplate.create({
        data: {
          tenantId: tenant.id,
          categoryId: categoryId ?? null,
          title,
          isStandard: false,
          schema: normalized,
        },
        select: { id: true, schema: true },
      });

      const schemaWithMeta = withTemplateSchemaMeta(first.schema, {
        lineageId: first.id,
        templateVersion: 1,
        isLive: true,
      }, title);

      await tx.formTemplate.update({
        where: { id: first.id },
        data: { schema: schemaWithMeta },
      });

      return { id: first.id };
    });

    return NextResponse.json({ templateId: created.id });
  } catch (error: any) {
    console.error("/api/templates/create POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
