import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

const bodySchema = z.object({
  tenantSlug: z.string().min(1),
  auditIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request — provide tenantSlug and auditIds" }, { status: 400 });
    }

    const { tenantSlug, auditIds } = parsed.data;
    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (me || !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPermission(membership.role, "audit.delete")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const uniqueIds = Array.from(new Set(auditIds));

    const { data: ownedRows, error: listErr } = await sb
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", tenant.id)
      .in("id", uniqueIds);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const ownedIds = (ownedRows || []).map((row) => row.id as string);
    if (!ownedIds.length) {
      return NextResponse.json({ error: "No matching submissions found for this brand" }, { status: 404 });
    }

    const { error: deleteErr } = await sb.from("audit_logs").delete().in("id", ownedIds);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    await recordActivity(sb, {
      tenantId: tenant.id,
      userId: user.id,
      action: "audit.delete",
      entityType: "AuditLog",
      entityId: ownedIds[0],
      details: { deletedCount: ownedIds.length, auditIds: ownedIds },
    });

    const { data: usageRows } = await sb.rpc("iso_estimate_tenant_storage_bytes", {
      p_tenant_id: tenant.id,
    });
    const breakdown = ((usageRows || []) as Array<{ component: string; bytes: number }>).reduce<
      Record<string, number>
    >((acc, row) => {
      acc[row.component] = Number(row.bytes || 0);
      return acc;
    }, {});
    const totalBytes = Object.values(breakdown).reduce((sum, n) => sum + n, 0);

    return NextResponse.json({
      deleted: ownedIds.length,
      skipped: uniqueIds.length - ownedIds.length,
      storage: {
        totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
        auditLogsMb: Number(((breakdown.audit_logs || 0) / (1024 * 1024)).toFixed(2)),
        breakdown,
      },
    });
  } catch (error: unknown) {
    console.error("/api/audit/delete POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
