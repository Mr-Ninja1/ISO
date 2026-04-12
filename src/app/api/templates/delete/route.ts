import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { getTemplateSchemaMeta } from "@/lib/templateVersioning";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
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

    const { tenantSlug, templateId } = parsed.data;

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const membership = await prisma.tenantMember.findFirst({
      where: { tenantId: tenant.id, userId: user.id },
      select: { role: true },
    });

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "forms.delete")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const current = await prisma.formTemplate.findFirst({
      where: { id: templateId, tenantId: tenant.id },
      select: { id: true, schema: true },
    });
    if (!current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const currentMeta = getTemplateSchemaMeta(current.schema);
    const lineageId = currentMeta.lineageId || current.id;

    const allTenantTemplates = await prisma.formTemplate.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, schema: true },
    });

    const lineageTemplateIds = allTenantTemplates
      .filter((t) => {
        const meta = getTemplateSchemaMeta(t.schema);
        return (meta.lineageId || t.id) === lineageId;
      })
      .map((t) => t.id);

    const auditCount = await prisma.auditLog.count({
      where: { tenantId: tenant.id, templateId: { in: lineageTemplateIds } },
    });

    if (auditCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete this form because it has submissions. Archive/hide fields instead." },
        { status: 409 }
      );
    }

    await prisma.formTemplate.deleteMany({
      where: { tenantId: tenant.id, id: { in: lineageTemplateIds } },
    });

    await recordActivity({
      tenantId: tenant.id,
      userId: user.id,
      action: "template.delete",
      entityType: "FormTemplateLineage",
      entityId: lineageId,
      details: { deletedTemplateIds: lineageTemplateIds },
    });

    return NextResponse.json({ deleted: lineageTemplateIds.length });
  } catch (error: any) {
    console.error("/api/templates/delete POST error", error);
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
