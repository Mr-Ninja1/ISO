import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";
import { scheduleBrandSyncChange } from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function loadCategoryWithAccess(sb: ReturnType<typeof createSupabaseWithBearer>, categoryId: string, userId: string) {
  const { data: category, error: ce } = await sb
    .from("categories")
    .select("id, tenant_id, name, sort_order")
    .eq("id", categoryId)
    .maybeSingle();

  if (ce || !category) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", category.tenant_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (me || !membership) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (!hasPermission(membership.role, "categories.manage")) {
    return { error: NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 }) };
  }

  return { category, membership };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const token = getBearerToken(request);
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

    const { categoryId } = await params;
    if (!categoryId) return NextResponse.json({ error: "Missing category id" }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as { name?: string; sortOrder?: number };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : undefined;

    if (!name && sortOrder === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);
    const access = await loadCategoryWithAccess(sb, categoryId, user.id);
    if ("error" in access && access.error) return access.error;
    const { category } = access;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name) patch.name = name;
    if (sortOrder !== undefined) patch.sort_order = sortOrder;

    const { data: updated, error: upErr } = await sb
      .from("categories")
      .update(patch)
      .eq("id", categoryId)
      .select("id, tenant_id, name, sort_order, created_at, updated_at")
      .single();

    if (upErr || !updated) {
      return NextResponse.json({ error: upErr?.message || "Update failed" }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: category.tenant_id as string,
      userId: user.id,
      action: "category.update",
      entityType: "Category",
      entityId: categoryId,
      details: { name: updated.name },
    });

    scheduleBrandSyncChange({
      sourceTenantId: category.tenant_id as string,
      entityType: "category",
      entityId: categoryId,
      changeType: "update",
    });

    return NextResponse.json({
      id: updated.id,
      tenantId: updated.tenant_id,
      name: updated.name,
      sortOrder: updated.sort_order,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ categoryId: string }> }) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { categoryId } = await params;
    if (!categoryId) {
      return NextResponse.json({ error: "Missing category id" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);
    const access = await loadCategoryWithAccess(sb, categoryId, user.id);
    if ("error" in access && access.error) return access.error;
    const { category } = access;

    const { error: delErr } = await sb.from("categories").delete().eq("id", categoryId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId: category.tenant_id as string,
      userId: user.id,
      action: "category.delete",
      entityType: "Category",
      entityId: categoryId,
    });

    scheduleBrandSyncChange({
      sourceTenantId: category.tenant_id as string,
      entityType: "category",
      entityId: categoryId,
      changeType: "delete",
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
