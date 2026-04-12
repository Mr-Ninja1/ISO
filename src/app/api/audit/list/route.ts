import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function parseSince(raw: string | null) {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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
  const tenantSlug = (searchParams.get("tenantSlug") || "").trim();
  const since = parseSince(searchParams.get("since"));

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

  if (!membership || !hasPermission(membership.role, "audit.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant.id,
      ...(since ? { updatedAt: { gt: since } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: since ? 1000 : 2000,
    select: {
      id: true,
      status: true,
      templateId: true,
      createdAt: true,
      updatedAt: true,
      submittedAt: true,
      template: { select: { title: true } },
    },
  });

  const serialized = rows.map((row) => ({
    id: row.id,
    status: row.status,
    templateId: row.templateId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    template: { title: row.template.title },
  }));

  const maxUpdatedAt = serialized[0]?.updatedAt || since?.toISOString() || null;

  return NextResponse.json(
    {
      rows: serialized,
      maxUpdatedAt,
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    }
  );
}
