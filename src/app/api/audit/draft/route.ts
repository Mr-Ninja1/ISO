import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
});

function draftUserIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as Record<string, any>).__draftMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const userId = (meta as Record<string, any>).userId;
  return typeof userId === "string" && userId ? userId : null;
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

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenantSlug: url.searchParams.get("tenantSlug"),
    templateId: url.searchParams.get("templateId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tenantSlug, templateId } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true, role: true },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasPermission(membership.role, "audit.saveDraft")) {
    return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
  }

  const candidates = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant.id,
      templateId,
      status: "DRAFT",
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      payload: true,
      updatedAt: true,
    },
  });

  const mine = candidates.find((d) => draftUserIdFromPayload(d.payload) === user.id);
  if (!mine) {
    return NextResponse.json({ draft: null });
  }

  const payload = mine.payload && typeof mine.payload === "object" && !Array.isArray(mine.payload)
    ? { ...(mine.payload as Record<string, unknown>) }
    : {};

  delete (payload as Record<string, unknown>).__draftMeta;

  return NextResponse.json({
    draft: {
      id: mine.id,
      payload,
      updatedAt: mine.updatedAt,
    },
  });
}
