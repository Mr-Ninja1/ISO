import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z.object({
  tenantSlug: z.string().min(1),
  templateId: z.string().uuid(),
});

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

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true, logoUrl: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const membership = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, tenantId: tenant.id },
    select: { id: true, title: true, schema: true, updatedAt: true },
  });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({
    tenant: {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl,
    },
    template: {
      id: template.id,
      title: template.title,
      schema: template.schema,
      updatedAt: template.updatedAt,
    },
  });
}
