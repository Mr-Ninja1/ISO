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
});

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

  const { tenantSlug, templateId, payload } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const audit = await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      templateId: template.id,
      status: "SUBMITTED",
      payload,
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  return NextResponse.json({ auditId: audit.id });
}
