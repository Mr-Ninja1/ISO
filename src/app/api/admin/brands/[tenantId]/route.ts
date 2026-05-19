import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tenantId) return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive is required" }, { status: 400 });
    }

    const { data: tenant, error } = await svc
      .from("tenants")
      .update({ is_active: body.isActive })
      .eq("id", tenantId)
      .select("id,name,slug,is_active,updated_at")
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: error?.message || "Failed to update brand" }, { status: 500 });
    }

    // Log the activation/deactivation action
    await svc.from("activity_logs").insert({
      tenant_id: tenantId,
      user_id: (await requirePlatformDeveloper(token))?.id,
      action: body.isActive ? "brand.activate" : "brand.deactivate",
      entity_type: "tenant",
      entity_id: tenantId,
      details: {
        brandName: tenant.name,
        brandSlug: tenant.slug,
        previousStatus: !body.isActive,
        newStatus: body.isActive,
      },
    });

    const row = tenant as Record<string, unknown>;
    return NextResponse.json({
      brand: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isActive: row.is_active,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}