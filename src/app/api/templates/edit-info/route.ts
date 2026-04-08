import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { getTemplateSchemaMeta, getTemplateSchemaVersion } from "@/lib/templateVersioning";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
});

export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      tenantSlug: url.searchParams.get("tenantSlug"),
      templateId: url.searchParams.get("templateId"),
    });

    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const { tenantSlug, templateId } = parsed.data;

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const template = await prisma.formTemplate.findFirst({
      where: { id: templateId, tenantId: tenant.id },
      select: { id: true, title: true, categoryId: true, schema: true },
    });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const auditCount = await prisma.auditLog.count({ where: { templateId: template.id, tenantId: tenant.id } });
    const hasAudits = auditCount > 0;

    const meta = getTemplateSchemaMeta(template.schema);

    return NextResponse.json({
      template: {
        id: template.id,
        title: template.title,
        categoryId: template.categoryId,
        schema: template.schema,
        lineageId: meta.lineageId || template.id,
        version: getTemplateSchemaVersion(template.schema),
      },
      lock: {
        hasAudits,
        auditCount,
      },
    });
  } catch (error: any) {
    console.error("/api/templates/edit-info GET error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
