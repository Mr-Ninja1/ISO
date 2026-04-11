import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

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

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

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

  if (String(membership.role) === "VIEWER") {
    return NextResponse.json({ error: "Viewer role cannot create drafts or submit audits" }, { status: 403 });
  }

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const staffRows = (await prisma.$queryRawUnsafe(
    `SELECT full_name, email FROM tenant_staff_pin WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
    tenant.id,
    user.id
  )) as Array<{ full_name: string; email: string }>;
  const staffProfile = staffRows[0] || null;

  const actorName = staffProfile?.full_name || (user.user_metadata as any)?.full_name || user.email || "Staff";
  const actorEmail = staffProfile?.email || user.email || "";

  if (isDraft) {
    const draftPayload = {
      ...payload,
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
      const candidates = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          templateId: template.id,
          status: "DRAFT",
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: { id: true, payload: true },
      });

      const mine = candidates.find((d) => draftUserIdFromPayload(d.payload) === user.id);
      if (mine) targetDraftId = mine.id;
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

  return NextResponse.json({ auditId: audit.id, status: "SUBMITTED" });
}
