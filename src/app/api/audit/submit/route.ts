import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/roleGate";
import { collectTemperatureAlerts } from "@/lib/temperatureMonitoring";
import { recordActivity } from "@/lib/activityTracker";
import { persistPhotoEvidenceToBucket } from "@/lib/photoEvidenceStorage";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
  payload: z.record(z.string(), z.any()),
  mode: z.enum(["submit", "draft"]).optional(),
  auditId: z.string().uuid().optional(),
});

function draftUserIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as Record<string, any>).__draftMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const userId = (meta as Record<string, any>).userId;
  return typeof userId === "string" && userId ? userId : null;
}

async function clearOtherUserDrafts(params: {
  tenantId: string;
  templateId: string;
  userId: string;
  keepAuditId: string;
}) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "AuditLog"
     WHERE "tenantId" = $1::uuid
       AND "templateId" = $2::uuid
       AND status = 'DRAFT'
       AND id <> $4::uuid
       AND COALESCE(payload->'__draftMeta'->>'userId', '') = $3`,
    params.tenantId,
    params.templateId,
    params.userId,
    params.keepAuditId
  );
}

export async function POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  let user: { id: string; email?: string | null; user_metadata?: unknown } | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser(token);
    user = authUser;
  } catch {
    return NextResponse.json(
      {
        error: "Authentication service is temporarily unavailable. You can continue offline and sync later.",
        code: "AUTH_SERVICE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tenantSlug, templateId, payload, mode, auditId } = parsed.data;
  const isDraft = mode === "draft";

  try {

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true, role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasPermission(membership.role, "audit.submit")) {
    return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
  }

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, tenantId: tenant.id },
    select: { id: true, ...(isDraft ? {} : { schema: true }) },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  let payloadRecord = payload as Record<string, unknown>;
  if (!isDraft) {
    const targetAuditId = auditId || `pending_${template.id}_${Date.now()}`;
    payloadRecord = await persistPhotoEvidenceToBucket(payloadRecord, tenantSlug, targetAuditId);
  }
  const existingTempMeta =
    payloadRecord.__temperatureMeta && typeof payloadRecord.__temperatureMeta === "object"
      ? (payloadRecord.__temperatureMeta as Record<string, unknown>)
      : {};
  const temperatureAlerts = !isDraft
    ? collectTemperatureAlerts(template.schema as any, payloadRecord)
    : [];
  const temperatureMeta = {
    ...existingTempMeta,
    alerts: temperatureAlerts,
    capturedAt: new Date().toISOString(),
  };

  const staffRows = (await prisma.$queryRawUnsafe(
    `SELECT full_name, email FROM tenant_staff_pin WHERE tenant_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
    tenant.id,
    user.id
  )) as Array<{ full_name: string; email: string }>;
  const staffProfile = staffRows[0] || null;

  const actorName = staffProfile?.full_name || (user.user_metadata as any)?.full_name || user.email || "Staff";
  const actorEmail = staffProfile?.email || user.email || "";

  if (isDraft) {
    const draftPayload = {
      ...payload,
      __temperatureMeta: temperatureMeta,
      __draftMeta: {
        userId: user.id,
        userName: actorName,
        userEmail: actorEmail,
      },
      __auditMeta: {
        submittedByUserId: user.id,
        submittedByName: actorName,
        submittedByEmail: actorEmail,
      },
    };

    let targetDraftId: string | null = null;

    if (auditId) {
      const existing = await prisma.auditLog.findFirst({
        where: {
          id: auditId,
          tenantId: tenant.id,
          templateId: template.id,
          status: "DRAFT",
        },
        select: { id: true },
      });
      if (existing) targetDraftId = existing.id;
    }

    if (!targetDraftId) {
      const mine = (await prisma.$queryRawUnsafe(
        `SELECT id
         FROM "AuditLog"
         WHERE "tenantId" = $1::uuid
           AND "templateId" = $2::uuid
           AND status = 'DRAFT'
           AND COALESCE(payload->'__draftMeta'->>'userId', '') = $3
         ORDER BY "updatedAt" DESC
         LIMIT 1`,
        tenant.id,
        template.id,
        user.id
      )) as Array<{ id: string }>;

      if (mine[0]?.id) targetDraftId = mine[0].id;
    }

    const audit = targetDraftId
      ? await prisma.auditLog.update({
          where: { id: targetDraftId },
          data: {
            payload: draftPayload,
            status: "DRAFT",
            submittedAt: null,
          },
          select: { id: true },
        })
      : await prisma.auditLog.create({
          data: {
            tenantId: tenant.id,
            templateId: template.id,
            status: "DRAFT",
            payload: draftPayload,
            submittedAt: null,
          },
          select: { id: true },
        });

    await recordActivity({
      tenantId: tenant.id,
      userId: user.id,
      action: "audit.saveDraft",
      entityType: "AuditLog",
      entityId: audit.id,
      details: { templateId: template.id, hasTemperatureAlerts: temperatureAlerts.length > 0 },
    });

    return NextResponse.json({ auditId: audit.id, status: "DRAFT" });
  }

  if (auditId) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        id: auditId,
        tenantId: tenant.id,
        templateId: template.id,
      },
      select: { id: true },
    });

    if (existing) {
      const audit = await prisma.auditLog.update({
        where: { id: existing.id },
        data: {
          payload: {
            ...payload,
            __temperatureMeta: temperatureMeta,
            __auditMeta: {
              submittedByUserId: user.id,
              submittedByName: actorName,
              submittedByEmail: actorEmail,
            },
          },
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
        select: { id: true },
      });

      await recordActivity({
        tenantId: tenant.id,
        userId: user.id,
        action: "audit.submit",
        entityType: "AuditLog",
        entityId: audit.id,
        details: { templateId: template.id, mode: "update", hasTemperatureAlerts: temperatureAlerts.length > 0 },
      });

      await clearOtherUserDrafts({
        tenantId: tenant.id,
        templateId: template.id,
        userId: user.id,
        keepAuditId: audit.id,
      });

      return NextResponse.json({ auditId: audit.id, status: "SUBMITTED" });
    }
  }

  const audit = await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      status: "SUBMITTED",
      payload: {
        ...payload,
        __temperatureMeta: temperatureMeta,
        __auditMeta: {
          submittedByUserId: user.id,
          submittedByName: actorName,
          submittedByEmail: actorEmail,
        },
      },
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  await recordActivity({
    tenantId: tenant.id,
    userId: user.id,
    action: "audit.submit",
    entityType: "AuditLog",
    entityId: audit.id,
    details: { templateId: template.id, mode: "create", hasTemperatureAlerts: temperatureAlerts.length > 0 },
  });

  await clearOtherUserDrafts({
    tenantId: tenant.id,
    templateId: template.id,
    userId: user.id,
    keepAuditId: audit.id,
  });

  return NextResponse.json({ auditId: audit.id, status: "SUBMITTED" });
  } catch (error: any) {
    if (error?.code === "P2024") {
      return NextResponse.json(
        {
          error: "Server is busy right now (database pool timeout). Please retry in a few seconds.",
          code: "DB_POOL_TIMEOUT",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Failed to process audit submission" }, { status: 500 });
  }
}
