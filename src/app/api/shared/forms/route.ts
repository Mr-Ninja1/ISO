import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { hasPermission } from "@/lib/roleGate";

function getBearerToken(req: Request) {
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function randomToken() {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      tenantSlug?: string;
      title?: string;
      mode?: "selected" | "today" | "all" | "live_today" | "live_all";
      auditIds?: string[];
      expiresInDays?: number | null;
    };

    const tenantSlug = String(body.tenantSlug || "").trim();
    const title = String(body.title || "Shared forms").trim() || "Shared forms";
    const mode =
      body.mode === "today" ||
      body.mode === "all" ||
      body.mode === "live_today" ||
      body.mode === "live_all"
        ? body.mode
        : "selected";
    const inputAuditIds = Array.isArray(body.auditIds)
      ? body.auditIds.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];

    if (!tenantSlug)
      return NextResponse.json(
        { error: "tenantSlug is required" },
        { status: 400 },
      );

    const sb = createSupabaseWithBearer(token);
    const svc = createServiceRoleSupabase();
    if (!svc)
      return NextResponse.json(
        { error: "Service role is not configured" },
        { status: 500 },
      );

    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id,name,slug")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tenantErr || !tenant)
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const { data: membership, error: membershipErr } = await sb
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      membershipErr ||
      !membership ||
      !hasPermission(membership.role, "audit.view")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isLive = mode === "live_today" || mode === "live_all";
    const liveScope =
      mode === "live_today" ? "today" : mode === "live_all" ? "all" : null;

    let auditIds = inputAuditIds;
    if (mode === "today" || mode === "live_today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await sb
        .from("audit_logs")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("status", "SUBMITTED")
        .gte("updated_at", start.toISOString())
        .order("updated_at", { ascending: false });
      auditIds = (data || []).map((row) => row.id as string);
    } else if (mode === "all" || mode === "live_all") {
      const { data } = await sb
        .from("audit_logs")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("status", "SUBMITTED")
        .order("updated_at", { ascending: false })
        .limit(500);
      auditIds = (data || []).map((row) => row.id as string);
    }

    auditIds = Array.from(new Set(auditIds));
    if (!auditIds.length) {
      return NextResponse.json(
        { error: "No submitted forms selected to share" },
        { status: 400 },
      );
    }

    const { data: allowedAudits, error: auditsErr } = await sb
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("status", "SUBMITTED")
      .in("id", auditIds);

    if (auditsErr)
      return NextResponse.json({ error: auditsErr.message }, { status: 500 });
    const validAuditIds = (allowedAudits || []).map((row) => row.id as string);
    if (!validAuditIds.length) {
      return NextResponse.json(
        { error: "No valid submitted forms found to share" },
        { status: 400 },
      );
    }

    const expiresInDays =
      typeof body.expiresInDays === "number" &&
      Number.isFinite(body.expiresInDays)
        ? Math.max(1, Math.floor(body.expiresInDays))
        : null;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;
    const shareToken = randomToken();

    const { data: link, error: linkErr } = await svc
      .from("shared_form_links")
      .insert({
        tenant_id: tenant.id,
        created_by_user_id: user.id,
        token: shareToken,
        title,
        mode,
        is_live: isLive,
        live_scope: liveScope,
        expires_at: expiresAt,
        is_active: true,
      })
      .select("id, token, title, mode, expires_at, created_at")
      .single();

    if (linkErr || !link) {
      return NextResponse.json(
        { error: linkErr?.message || "Failed to create shared link" },
        { status: 500 },
      );
    }

    const items = validAuditIds.map((auditId, index) => ({
      link_id: link.id,
      audit_id: auditId,
      sort_order: index,
    }));

    const { error: itemsErr } = await svc
      .from("shared_form_link_items")
      .insert(items);
    if (itemsErr) {
      await svc.from("shared_form_links").delete().eq("id", link.id);
      return NextResponse.json(
        { error: itemsErr.message || "Failed to attach forms to shared link" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      share: {
        id: link.id,
        token: link.token,
        title: link.title,
        mode: link.mode,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
        auditCount: validAuditIds.length,
        href: `/shared/forms?token=${encodeURIComponent(link.token)}`,
      },
    });
  } catch (error) {
    console.error("[shared/forms] failed to create share link", error);
    const message =
      error instanceof Error ? error.message : "Failed to create shared link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
