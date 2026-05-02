import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const querySchema = z
  .object({
    tenantSlug: z.string().min(1),
    templateId: z.string().uuid().optional(),
    auditId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.templateId || v.auditId), {
    message: "templateId or auditId is required",
  });

function draftUserIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const meta = (payload as Record<string, unknown>).__draftMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const userId = (meta as Record<string, unknown>).userId;
  return typeof userId === "string" && userId ? userId : null;
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

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    tenantSlug: url.searchParams.get("tenantSlug"),
    templateId: url.searchParams.get("templateId"),
    auditId: url.searchParams.get("auditId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { tenantSlug, templateId, auditId } = parsed.data;
  const sb = createSupabaseWithBearer(token);

  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

  if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasPermission(membership.role, "audit.saveDraft")) {
    return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
  }

  let mine: { id: string; payload: unknown; updatedAt: string } | undefined;

  if (auditId) {
    let q = sb
      .from("audit_logs")
      .select("id, payload, updated_at")
      .eq("id", auditId)
      .eq("tenant_id", tenant.id)
      .eq("status", "DRAFT");
    if (templateId) q = q.eq("template_id", templateId);
    const { data: exact } = await q.maybeSingle();
    if (exact) {
      const row = exact as { id: string; payload: unknown; updated_at: string };
      mine = { id: row.id, payload: row.payload, updatedAt: row.updated_at };
    }
  }

  if (!mine && templateId) {
    const { data: candidates } = await sb
      .from("audit_logs")
      .select("id, payload, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("template_id", templateId)
      .eq("status", "DRAFT")
      .order("updated_at", { ascending: false })
      .limit(50);

    const row = (candidates || []).find((d) => draftUserIdFromPayload(d.payload) === user.id);
    if (row) {
      mine = {
        id: row.id as string,
        payload: row.payload,
        updatedAt: row.updated_at as string,
      };
    }
  }

  if (!mine) {
    return NextResponse.json({ draft: null });
  }

  const payload =
    mine.payload && typeof mine.payload === "object" && !Array.isArray(mine.payload)
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
