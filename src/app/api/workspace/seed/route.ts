import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
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

    const body = await req.json().catch(() => null);
    const tenantSlug = body?.tenantSlug || "";
    const namesInput = Array.isArray(body?.names) ? body.names : [];

    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const normalized = namesInput
      .map((n: unknown) => (typeof n === "string" ? normalizeName(n) : ""))
      .filter((n: string) => Boolean(n));

    const names: string[] = Array.from(new Set<string>(normalized)).slice(0, 50);

    if (names.length === 0) {
      return NextResponse.json({ error: "At least one category is required" }, { status: 400 });
    }

    const sb = createSupabaseWithBearer(token);

    const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();

    if (te || !tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: me } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (me || !membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasPermission(membership.role, "categories.manage")) {
      return NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 });
    }

    const { data: existingRows } = await sb.from("categories").select("name").eq("tenant_id", tenant.id);

    const existingNames = new Set((existingRows || []).map((r) => r.name as string));
    const toAdd = names.filter((n) => !existingNames.has(n));

    if (toAdd.length === 0) {
      return NextResponse.json({ createdCount: 0 });
    }

    const { data: maxSort } = await sb
      .from("categories")
      .select("sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let baseOrder = typeof maxSort?.sort_order === "number" ? maxSort.sort_order + 1 : 0;

    const rows = toAdd.map((name, idx) => ({
      tenant_id: tenant.id,
      name,
      sort_order: baseOrder + idx,
    }));

    const { error: insErr } = await sb.from("categories").insert(rows);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ createdCount: toAdd.length });
  } catch (error: unknown) {
    console.error("/api/workspace/seed POST error", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
