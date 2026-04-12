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
};

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

  return NextResponse.json({ rows });
}
