import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import {
  getTemplateSchemaMeta,
  getTemplateSchemaVersion,
  normalizeTemplateSchema,
  withTemplateSchemaMeta,
} from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
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
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, templateId, title, categoryId, schema } = parsed.data;

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true, role: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "forms.edit")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, tenantId: tenant.id },
        select: { id: true },
      });
      if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const current = await prisma.formTemplate.findFirst({
      where: { id: templateId, tenantId: tenant.id },
      select: { id: true, title: true, categoryId: true, schema: true },
    });
    if (!current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    let normalized;
    try {
      normalized = normalizeTemplateSchema(schema, title);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Invalid schema" }, { status: 400 });
    }

    const auditCount = await prisma.auditLog.count({ where: { templateId: current.id, tenantId: tenant.id } });
    const hasAudits = auditCount > 0;

    const currentMeta = getTemplateSchemaMeta(current.schema);
    const lineageId = currentMeta.lineageId || current.id;
    const currentVersion = getTemplateSchemaVersion(current.schema);

    if (!hasAudits) {
      const schemaForUpdate = withTemplateSchemaMeta(
        normalized,
        {
          lineageId,
          templateVersion: currentVersion,
          isLive: true,
          previousTemplateId: currentMeta.previousTemplateId,
        },
        title
      );

      await prisma.formTemplate.update({
        where: { id: current.id },
        data: {
          title,
          categoryId: categoryId ?? null,
          schema: schemaForUpdate,
        },
      });

      return NextResponse.json({
        mode: "overwrite",
        templateId: current.id,
        version: currentVersion,
      });
    }

    const nextVersion = currentVersion + 1;

    const created = await prisma.$transaction(async (tx) => {
      const oldSchemaInactive = withTemplateSchemaMeta(
        current.schema,
        {
          lineageId,
          templateVersion: currentVersion,
          isLive: false,
          previousTemplateId: currentMeta.previousTemplateId,
        },
        current.title
      );

      await tx.formTemplate.update({
        where: { id: current.id },
        data: { schema: oldSchemaInactive },
      });

      const nextSchema = withTemplateSchemaMeta(
        normalized,
        {
          lineageId,
          templateVersion: nextVersion,
          isLive: true,
          previousTemplateId: current.id,
        },
        title
      );

      const next = await tx.formTemplate.create({
        data: {
          tenantId: tenant.id,
          title,
          categoryId: categoryId ?? null,
          isStandard: false,
          schema: nextSchema,
        },
        select: { id: true },
      });

      return next;
    });

    return NextResponse.json({
      mode: "versioned",
      templateId: created.id,
      previousTemplateId: current.id,
      version: nextVersion,
    });
  } catch (error: any) {
    console.error("/api/templates/save-changes POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
