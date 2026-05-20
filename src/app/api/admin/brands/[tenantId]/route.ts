import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeDeactivationReason(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tenantId) return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });

    const developer = await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as {
      isActive?: boolean;
      deactivationReason?: string | null;
    };
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive is required" }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { is_active: body.isActive };
    if (body.isActive) {
      updatePayload.deactivation_reason = null;
    } else if (body.deactivationReason !== undefined) {
      updatePayload.deactivation_reason = normalizeDeactivationReason(body.deactivationReason);
    }

    const { data: tenant, error } = await svc
      .from("tenants")
      .update(updatePayload)
      .eq("id", tenantId)
      .select("id,name,slug,is_active,deactivation_reason,updated_at")
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: error?.message || "Failed to update brand" }, { status: 500 });
    }

    await svc.from("activity_logs").insert({
      tenant_id: tenantId,
      user_id: developer?.id ?? null,
      action: body.isActive ? "brand.activate" : "brand.deactivate",
      entity_type: "tenant",
      entity_id: tenantId,
      details: {
        brandName: tenant.name,
        brandSlug: tenant.slug,
        previousStatus: !body.isActive,
        newStatus: body.isActive,
        deactivationReason: body.isActive ? null : (tenant.deactivation_reason as string | null) ?? null,
      },
    });

    const row = tenant as Record<string, unknown>;
    return NextResponse.json({
      brand: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isActive: row.is_active,
        deactivationReason: (row.deactivation_reason as string | null) ?? null,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tenantId) return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });

    const developer = await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as { confirmSlug?: string };
    const confirmSlug = typeof body.confirmSlug === "string" ? body.confirmSlug.trim().toLowerCase() : "";

    const { data: tenant, error: loadErr } = await svc
      .from("tenants")
      .select("id,name,slug")
      .eq("id", tenantId)
      .maybeSingle();

    if (loadErr || !tenant) {
      return NextResponse.json({ error: loadErr?.message || "Brand not found" }, { status: 404 });
    }

    const slug = String((tenant as Record<string, unknown>).slug || "").toLowerCase();
    if (!confirmSlug || confirmSlug !== slug) {
      return NextResponse.json(
        { error: "Type the brand slug exactly to confirm permanent deletion." },
        { status: 400 }
      );
    }

    const { error: deleteErr } = await svc.from("tenants").delete().eq("id", tenantId);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message || "Failed to delete brand" }, { status: 500 });
    }

    return NextResponse.json({
      deleted: true,
      brand: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        deletedBy: developer?.id ?? null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
