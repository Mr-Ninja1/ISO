import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { recordActivity } from "@/lib/activityTracker";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
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

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: categories, error: ce } = await sb
      .from("categories")
      .select("id, tenant_id, name, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (ce) {
      return NextResponse.json({ error: ce.message }, { status: 500 });
    }

    const mapped = (categories || []).map((c) => ({
      id: c.id as string,
      tenantId: c.tenant_id as string,
      name: c.name as string,
      sortOrder: Number(c.sort_order ?? 0),
    }));

    return NextResponse.json({ categories: mapped });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
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

    const body = await req.json().catch(() => null);
    const tenantId = body?.tenantId;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!tenantId || typeof tenantId !== "string") {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasPermission(membership.role, "categories.manage")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { data: category, error: ce } = await sb
      .from("categories")
      .insert({ tenant_id: tenantId, name, sort_order: 0 })
      .select("id, tenant_id, name, sort_order")
      .single();

    if (ce || !category) {
      return NextResponse.json({ error: ce?.message || "Create failed" }, { status: 500 });
    }

    await recordActivity(sb, {
      tenantId,
      userId: user.id,
      action: "category.create",
      entityType: "Category",
      entityId: category.id as string,
      details: { name },
    });

    try {
      const { data: tenantRec } = await sb.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
      const slug = tenantRec?.slug as string | undefined;
      if (slug) {
        const globalForWorkspaceCache = globalThis as unknown as { workspaceResponseCache?: Map<string, unknown> };
        const cache = globalForWorkspaceCache.workspaceResponseCache;
        if (cache instanceof Map) {
          for (const k of Array.from(cache.keys())) {
            if (typeof k === "string" && k.startsWith(`${slug}:`)) {
              cache.delete(k);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      id: category.id,
      tenantId: category.tenant_id,
      name: category.name,
      sortOrder: category.sort_order,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
