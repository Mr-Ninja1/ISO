import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { persistPhotoEvidenceToBucket } from "@/lib/photoEvidenceStorage";
import { recordActivity } from "@/lib/activityTracker";
import { sendCorrectiveActionEmail } from "@/lib/notifications/emailAlerts";

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

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tenantSlug = (searchParams.get("tenantSlug") || "").trim();
  if (!tenantSlug) return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });

  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id, name, slug").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rows, error: listErr } = await sb
    .from("corrective_actions")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("updated_at", { ascending: false });

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const now = Date.now();
  const actions = (rows || [])
    .map((row) => {
      const evidence = getEvidence(row.evidence);
      const dueDateRaw = row.due_date as string | null;
      const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString() : null;
      const status = row.status as string;
      const dueMs = dueDateRaw ? new Date(dueDateRaw).getTime() : null;
      const isOverdue = Boolean(status !== "CLOSED" && dueMs !== null && dueMs < now);
      return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        ownerName: row.owner_name as string,
        ownerEmail: row.owner_email as string | null,
        dueDate,
        status,
        sourceType: row.source_type as string | null,
        sourceId: row.source_id as string | null,
        evidence,
        closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
        archivedAt: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
        createdAt: new Date(row.created_at as string).toISOString(),
        updatedAt: new Date(row.updated_at as string).toISOString(),
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

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { tenantSlug, title, description, ownerName, ownerEmail, dueDate, sourceType, sourceId, evidenceNotes, evidencePhotos } =
    parsed.data;

  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = crypto.randomUUID();
  const evidencePayload = evidencePhotos?.length ? await persistPhotoEvidenceToBucket({ evidencePhotos }, tenantSlug, id) : { evidencePhotos: evidencePhotos || [] };
  const photos = Array.isArray((evidencePayload as Record<string, unknown>).evidencePhotos)
    ? ((evidencePayload as Record<string, unknown>).evidencePhotos as unknown[]).filter((item): item is string => typeof item === "string")
    : [];

  const dueParsed = parseDate(dueDate);

  const { error: insErr } = await sb.from("corrective_actions").insert({
    id,
    tenant_id: tenant.id,
    title,
    description,
    owner_name: ownerName,
    owner_email: safeString(ownerEmail),
    due_date: dueParsed ? dueParsed.toISOString() : null,
    source_type: safeString(sourceType),
    source_id: safeString(sourceId),
    status: "OPEN",
    evidence: {
      notes: safeString(evidenceNotes),
      photos,
    },
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await recordActivity(sb, {
    tenantId: tenant.id as string,
    userId: user.id,
    action: "correctiveAction.create",
    entityType: "CorrectiveAction",
    entityId: id,
    details: {
      title,
      ownerName,
      status: "OPEN",
    },
  });

  const createdEmail = await sendCorrectiveActionEmail({
    to: safeString(ownerEmail),
    tenantSlug,
    actionId: id,
    subject: `Corrective action assigned: ${title}`,
    message: `A corrective action has been assigned to you.\n\nStatus: Open\nOwner: ${ownerName}`,
  });

  return NextResponse.json({ ok: true, actionId: id, email: createdEmail });
}

export async function PATCH(req: Request) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { actionId, tenantSlug, title, description, ownerName, ownerEmail, dueDate, sourceType, sourceId, evidenceNotes, evidencePhotos, status } =
    parsed.data;

  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership || !hasPermission(membership.role, "settings.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing, error: exErr } = await sb
    .from("corrective_actions")
    .select("*")
    .eq("id", actionId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (exErr || !existing) return NextResponse.json({ error: "Corrective action not found" }, { status: 404 });

  const existingStatus = existing.status as string;
  const nextStatus = status || existingStatus;
  const statusChanged = nextStatus !== existingStatus;

  const evidencePayload = evidencePhotos?.length ? await persistPhotoEvidenceToBucket({ evidencePhotos }, tenantSlug, actionId) : { evidencePhotos: [] };
  const newPhotos = Array.isArray((evidencePayload as Record<string, unknown>).evidencePhotos)
    ? ((evidencePayload as Record<string, unknown>).evidencePhotos as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const currentEvidence = getEvidence(existing.evidence);
  const nextEvidence = {
    notes: safeString(evidenceNotes) ?? currentEvidence.notes,
    photos: newPhotos.length > 0 ? [...currentEvidence.photos, ...newPhotos] : currentEvidence.photos,
  };

  const parsedDue = dueDate === undefined ? undefined : parseDate(dueDate);
  const nextDue =
    dueDate === undefined
      ? (existing.due_date as string | null)
      : parsedDue
        ? parsedDue.toISOString()
        : null;

  const closedAt =
    nextStatus === "CLOSED" ? ((existing.closed_at as string | null) ?? new Date().toISOString()) : null;
  const archivedAt =
    nextStatus === "CLOSED" ? ((existing.archived_at as string | null) ?? new Date().toISOString()) : null;

  const { error: updErr } = await sb
    .from("corrective_actions")
    .update({
      title: safeString(title) || (existing.title as string),
      description: safeString(description) || (existing.description as string),
      owner_name: safeString(ownerName) || (existing.owner_name as string),
      owner_email: ownerEmail === undefined ? (existing.owner_email as string | null) : safeString(ownerEmail),
      due_date: nextDue,
      source_type: sourceType === undefined ? (existing.source_type as string | null) : safeString(sourceType),
      source_id: sourceId === undefined ? (existing.source_id as string | null) : safeString(sourceId),
      status: nextStatus,
      evidence: nextEvidence,
      closed_at: closedAt,
      archived_at: archivedAt,
    })
    .eq("id", existing.id as string)
    .eq("tenant_id", tenant.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const updatedTitle = safeString(title) || (existing.title as string);
  const updatedOwner = safeString(ownerName) || (existing.owner_name as string);

  await recordActivity(sb, {
    tenantId: tenant.id as string,
    userId: user.id,
    action: statusChanged
      ? nextStatus === "CLOSED"
        ? "correctiveAction.archive"
        : existingStatus === "CLOSED"
          ? "correctiveAction.reopen"
          : "correctiveAction.update"
      : "correctiveAction.update",
    entityType: "CorrectiveAction",
    entityId: actionId,
    details: {
      title: updatedTitle,
      ownerName: updatedOwner,
      status: nextStatus,
    },
  });

  const updatedEmail = await sendCorrectiveActionEmail({
    to: ownerEmail === undefined ? (existing.owner_email as string | null) : safeString(ownerEmail),
    tenantSlug,
    actionId,
    subject: `Corrective action updated: ${updatedTitle}`,
    message: `Status is now ${nextStatus.replace("_", " ")}.\nOwner: ${updatedOwner}`,
  });

  return NextResponse.json({ ok: true, actionId, email: updatedEmail });
}
