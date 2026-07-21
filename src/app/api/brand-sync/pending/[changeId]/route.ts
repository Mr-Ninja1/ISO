import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";
import { resolvePendingChange } from "@/lib/brandSync";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

async function loadTenantAdmin(req: Request, tenantSlug: string) {
  const token = getBearerToken(req);
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const sb = createSupabaseWithBearer(token);
  const { data: tenant, error: te } = await sb.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (te || !tenant) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };

  const { data: membership, error: me } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (me || !membership) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (!hasPermission(membership.role, "categories.manage")) {
    return { error: NextResponse.json({ error: "Insufficient role permissions" }, { status: 403 }) };
  }

  return { user, tenantId: tenant.id as string };
}

export async function POST(req: Request, { params }: { params: Promise<{ changeId: string }> }) {
  try {
    const { changeId } = await params;
    const body = await req.json().catch(() => null);
    const tenantSlug = typeof body?.tenantSlug === "string" ? body.tenantSlug.trim() : "";
    const action = body?.action === "reject" ? "reject" : "approve";

    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const access = await loadTenantAdmin(req, tenantSlug);
    if ("error" in access && access.error) return access.error;

    const result = await resolvePendingChange({
      changeId,
      targetTenantId: access.tenantId,
      action,
      resolvedBy: access.user.id,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
