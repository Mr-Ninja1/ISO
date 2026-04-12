import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
  const statusRaw = (searchParams.get("status") || "").toUpperCase();
  const q = (searchParams.get("q") || "").trim();

  if (!tenantSlug) {
    return NextResponse.json({ error: "Missing tenantSlug" }, { status: 400 });
  }

  const normalizedStatus = statusRaw === "DRAFT" || statusRaw === "SUBMITTED" ? statusRaw : undefined;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
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
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(q
        ? {
            template: {
              title: { contains: q, mode: "insensitive" },
            },
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 5000,
    select: {
      id: true,
      status: true,
      templateId: true,
      createdAt: true,
      updatedAt: true,
      submittedAt: true,
      payload: true,
      template: {
        select: { title: true },
      },
    },
  });

  const header = [
    "auditId",
    "status",
    "templateId",
    "templateTitle",
    "createdAt",
    "updatedAt",
    "submittedAt",
    "submittedByName",
    "submittedByEmail",
    "payloadJson",
  ];

  const csvRows = rows.map((row) => {
    const payloadRecord = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
    const auditMeta = payloadRecord.__auditMeta && typeof payloadRecord.__auditMeta === "object" && !Array.isArray(payloadRecord.__auditMeta)
      ? (payloadRecord.__auditMeta as Record<string, unknown>)
      : {};

    return [
      row.id,
      row.status,
      row.templateId,
      row.template.title,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
      row.submittedAt ? row.submittedAt.toISOString() : "",
      typeof auditMeta.submittedByName === "string" ? auditMeta.submittedByName : "",
      typeof auditMeta.submittedByEmail === "string" ? auditMeta.submittedByEmail : "",
      JSON.stringify(payloadRecord),
    ];
  });

  const body = [header, ...csvRows].map((line) => line.map(escapeCsv).join(",")).join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"forms-export-${tenant.slug}.csv\"`,
      "cache-control": "no-store",
    },
  });
}
