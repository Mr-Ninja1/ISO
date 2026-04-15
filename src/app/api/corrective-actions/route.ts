import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/roleGate";
import { persistPhotoEvidenceToBucket } from "@/lib/photoEvidenceStorage";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const statusSchema = z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]);

const createSchema = z.object({
  tenantSlug: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  ownerName: z.string().trim().min(1),
  ownerEmail: z.string().trim().email().optional().or(z.literal("")),
  dueDate: z.string().trim().optional().or(z.literal("")),
  sourceType: z.string().trim().optional().or(z.literal("")),
  sourceId: z.string().trim().optional().or(z.literal("")),
  evidenceNotes: z.string().optional().or(z.literal("")),
  evidencePhotos: z.array(z.string()).optional(),
});

const updateSchema = createSchema.extend({
  actionId: z.string().uuid(),
  status: statusSchema.optional(),
});

function parseDate(raw?: string | null) {
  if (!raw || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { notes: null as string | null, photos: [] as string[] };
  }

  const record = value as Record<string, unknown>;
  return {
    notes: safeString(record.notes) || null,
    photos: Array.isArray(record.photos) ? record.photos.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
  };
}

function rowStatusPriority(status: string) {
  if (status === "OPEN") return 0;
  if (status === "IN_PROGRESS") return 1;
  return 2;
}

function mapStatus(value: unknown) {
  if (value === "OPEN" || value === "IN_PROGRESS" || value === "CLOSED") return value;
  return "OPEN";
}

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const tenantSlug = (searchParams.get("tenantSlug") || "").trim();
  if (!tenantSlug) return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, slug: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { role: true },
  });

  if (!membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.correctiveAction.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ updatedAt: "desc" }],
  });

  const now = Date.now();
  const actions = rows
    .map((row) => {
      const evidence = getEvidence(row.evidence);
      const dueDate = row.dueDate ? row.dueDate.toISOString() : null;
      const isOverdue = Boolean(row.status !== "CLOSED" && row.dueDate && row.dueDate.getTime() < now);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        ownerName: row.ownerName,
        ownerEmail: row.ownerEmail,
        dueDate,
        status: row.status,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        evidence,
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
        archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        isOverdue,
      };
    })
    .sort((a, b) => {
      const statusDelta = rowStatusPriority(a.status) - rowStatusPriority(b.status);
      if (statusDelta !== 0) return statusDelta;
      const dueA = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
      const dueB = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

  const summary = {
    total: actions.length,
    open: actions.filter((action) => action.status === "OPEN").length,
    inProgress: actions.filter((action) => action.status === "IN_PROGRESS").length,
    closed: actions.filter((action) => action.status === "CLOSED").length,
    overdue: actions.filter((action) => action.isOverdue).length,
    archived: actions.filter((action) => action.status === "CLOSED").length,
  };

  return NextResponse.json(
    { tenant, summary, actions },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}

export async function POST(req: Request) {
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

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { tenantSlug, title, description, ownerName, ownerEmail, dueDate, sourceType, sourceId, evidenceNotes, evidencePhotos } = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { role: true },
  });

  if (!membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const evidencePayload = evidencePhotos?.length ? await persistPhotoEvidenceToBucket({ evidencePhotos }, tenantSlug, id) : { evidencePhotos: evidencePhotos || [] };
  const photos = Array.isArray((evidencePayload as Record<string, unknown>).evidencePhotos)
    ? ((evidencePayload as Record<string, unknown>).evidencePhotos as unknown[]).filter((item): item is string => typeof item === "string")
    : [];

  const created = await prisma.correctiveAction.create({
    data: {
      id,
      tenantId: tenant.id,
      title,
      description,
      ownerName,
      ownerEmail: safeString(ownerEmail),
      dueDate: parseDate(dueDate),
      sourceType: safeString(sourceType),
      sourceId: safeString(sourceId),
      status: "OPEN",
      evidence: {
        notes: safeString(evidenceNotes),
        photos,
      },
    },
  });

  await recordActivity({
    tenantId: tenant.id,
    userId: user.id,
    action: "correctiveAction.create",
    entityType: "CorrectiveAction",
    entityId: created.id,
    details: {
      title: created.title,
      ownerName: created.ownerName,
      status: created.status,
    },
  });

  return NextResponse.json({ ok: true, actionId: created.id });
}

export async function PATCH(req: Request) {
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

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { actionId, tenantSlug, title, description, ownerName, ownerEmail, dueDate, sourceType, sourceId, evidenceNotes, evidencePhotos, status } = parsed.data;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { role: true },
  });

  if (!membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.correctiveAction.findFirst({
    where: { id: actionId, tenantId: tenant.id },
  });

  if (!existing) return NextResponse.json({ error: "Corrective action not found" }, { status: 404 });

  const nextStatus = status || existing.status;
  const statusChanged = nextStatus !== existing.status;
  const evidencePayload = evidencePhotos?.length ? await persistPhotoEvidenceToBucket({ evidencePhotos }, tenantSlug, actionId) : { evidencePhotos: [] };
  const newPhotos = Array.isArray((evidencePayload as Record<string, unknown>).evidencePhotos)
    ? ((evidencePayload as Record<string, unknown>).evidencePhotos as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const currentEvidence = getEvidence(existing.evidence);
  const nextEvidence = {
    notes: safeString(evidenceNotes) ?? currentEvidence.notes,
    photos: newPhotos.length > 0 ? [...currentEvidence.photos, ...newPhotos] : currentEvidence.photos,
  };

  const updated = await prisma.correctiveAction.update({
    where: { id: existing.id },
    data: {
      title: safeString(title) || existing.title,
      description: safeString(description) || existing.description,
      ownerName: safeString(ownerName) || existing.ownerName,
      ownerEmail: safeString(ownerEmail),
      dueDate: dueDate === undefined ? existing.dueDate : parseDate(dueDate),
      sourceType: sourceType === undefined ? existing.sourceType : safeString(sourceType),
      sourceId: sourceId === undefined ? existing.sourceId : safeString(sourceId),
      status: nextStatus,
      evidence: nextEvidence,
      closedAt: nextStatus === "CLOSED" ? existing.closedAt || new Date() : null,
      archivedAt: nextStatus === "CLOSED" ? existing.archivedAt || new Date() : null,
    },
  });

  await recordActivity({
    tenantId: tenant.id,
    userId: user.id,
    action: statusChanged ? (nextStatus === "CLOSED" ? "correctiveAction.archive" : existing.status === "CLOSED" ? "correctiveAction.reopen" : "correctiveAction.update") : "correctiveAction.update",
    entityType: "CorrectiveAction",
    entityId: updated.id,
    details: {
      title: updated.title,
      ownerName: updated.ownerName,
      status: updated.status,
    },
  });

  return NextResponse.json({ ok: true, actionId: updated.id });
}
