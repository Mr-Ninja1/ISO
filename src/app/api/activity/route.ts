import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { normalizeRole } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

type ActivityRow = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  createdAt: Date;
  actorName: string | null;
  actorEmail: string | null;
  targetName: string | null;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get("tenantSlug") || "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || "100"), 1), 500);

  if (!tenantSlug) {
    return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { role: true },
  });

  const role = normalizeRole(membership?.role);
  if (!membership || (role !== "ADMIN" && role !== "MANAGER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.formTemplate.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, title: true },
  });
  const templateTitleById = new Map(templates.map((template) => [template.id, template.title]));

  const rowUserIds = Array.from(new Set([user.id]));

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
      a."id",
      a."userId",
      a."action",
      a."entityType",
      a."entityId",
      a."details",
      a."createdAt",
      p.full_name AS "actorName",
      p.email AS "actorEmail"
    FROM "ActivityLog" a
    LEFT JOIN tenant_staff_pin p
      ON p.tenant_id = $1::uuid
     AND p.user_id = a."userId"
    WHERE a."tenantId" = $1::uuid
    ORDER BY a."createdAt" DESC
    LIMIT $2`,
    tenant.id,
    limit
  )) as ActivityRow[];

  for (const row of rows) {
    if (!rowUserIds.includes(row.userId)) {
      rowUserIds.push(row.userId);
    }
  }

  const authUserById = new Map<string, { fullName: string | null; email: string | null }>();
  const supabaseAdmin = getSupabaseAdmin();
  if (supabaseAdmin) {
    let page = 1;
    const pendingIds = new Set(rowUserIds);

    while (pendingIds.size > 0 && page <= 20) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;

      const users = data?.users || [];
      for (const authUser of users) {
        if (!pendingIds.has(authUser.id)) continue;
        authUserById.set(authUser.id, {
          fullName: (authUser.user_metadata as Record<string, unknown> | undefined)?.full_name as string | null ?? null,
          email: authUser.email || null,
        });
        pendingIds.delete(authUser.id);
      }

      if (users.length < 200) break;
      page += 1;
    }
  }

  const enrichedRows = rows.map((row) => {
    const details = row.details && typeof row.details === "object" && !Array.isArray(row.details) ? (row.details as Record<string, unknown>) : null;
    const detailTemplateId = typeof details?.templateId === "string" ? details.templateId : null;
    const detailActorName =
      typeof details?.submittedByName === "string"
        ? details.submittedByName
        : typeof details?.userName === "string"
          ? details.userName
          : null;
    const detailActorEmail =
      typeof details?.submittedByEmail === "string"
        ? details.submittedByEmail
        : typeof details?.userEmail === "string"
          ? details.userEmail
          : null;
    const authUser = authUserById.get(row.userId) || null;
    const targetName =
      row.entityType === "AuditLog"
        ? (detailTemplateId ? templateTitleById.get(detailTemplateId) || null : null)
        : row.entityType === "FormTemplate"
          ? (row.entityId ? templateTitleById.get(row.entityId) || null : null)
          : typeof details?.title === "string"
            ? details.title
            : typeof details?.name === "string"
              ? details.name
              : null;

    return {
      ...row,
      actorName: row.actorName || detailActorName || authUser?.fullName || null,
      actorEmail: row.actorEmail || detailActorEmail || authUser?.email || null,
      targetName,
    };
  });

  return NextResponse.json({ rows: enrichedRows });
}
