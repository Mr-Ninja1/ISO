import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

type AlertRow = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  source: "tenant" | "global";
};

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const {
      data: { user },
    } = await authClient.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const sb = createSupabaseWithBearer(token);
    const { data: tenant, error: tenantErr } = await sb
      .from("tenants")
      .select("id,is_active")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if ((tenant as Record<string, unknown>).is_active === false) {
      return NextResponse.json(
        { error: "This brand has been deactivated", code: "TENANT_DEACTIVATED" },
        { status: 403 }
      );
    }

    const tenantId = String((tenant as Record<string, unknown>).id || "");

    const svc = createServiceRoleSupabase();
    let minNativeBuild: number | null = null;
    let liveUpdateChannel: string | null = null;
    let liveUpdateBundleUrl: string | null = null;
    if (svc) {
      const { data: ps } = await svc
        .from("platform_settings")
        .select("min_native_build, live_update_channel, live_update_bundle_url")
        .eq("id", "default")
        .maybeSingle();
      if (ps) {
        const row = ps as Record<string, unknown>;
        const min = row.min_native_build;
        minNativeBuild = typeof min === "number" && Number.isFinite(min) ? min : null;
        liveUpdateChannel = typeof row.live_update_channel === "string" ? row.live_update_channel : null;
        liveUpdateBundleUrl = typeof row.live_update_bundle_url === "string" ? row.live_update_bundle_url : null;
      }
    }

    const { data: tenantAlerts, error: tenantAlertsErr } = await sb
      .from("tenant_announcements")
      .select("id,title,message,created_at")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(12);

    if (tenantAlertsErr) {
      return NextResponse.json({ error: tenantAlertsErr.message }, { status: 500 });
    }

    const tenantRows = tenantAlerts || [];
    const tenantIds = tenantRows.map((row) => String((row as Record<string, unknown>).id || ""));
    const { data: tenantReadRecords } = await sb
      .from("tenant_announcement_reads")
      .select("announcement_id")
      .eq("user_id", user.id)
      .in("announcement_id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

    const tenantReadSet = new Set(
      (tenantReadRecords || []).map((r) => String((r as Record<string, unknown>).announcement_id || ""))
    );

    const tenantMapped: AlertRow[] = tenantRows.map((row) => {
      const mapped = row as Record<string, unknown>;
      const id = String(mapped.id || "");
      return {
        id,
        title: String(mapped.title || ""),
        message: String(mapped.message || ""),
        createdAt: String(mapped.created_at || ""),
        isRead: tenantReadSet.has(id),
        source: "tenant" as const,
      };
    });

    let globalMapped: AlertRow[] = [];
    const { data: globalRows, error: globalErr } = await sb
      .from("global_announcements")
      .select("id,title,message,created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(16);

    if (!globalErr && globalRows) {
      const gIds = globalRows.map((row) => String((row as Record<string, unknown>).id || ""));
      const { data: globalReadRecords } = await sb
        .from("global_announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", gIds.length > 0 ? gIds : ["00000000-0000-0000-0000-000000000000"]);

      const globalReadSet = new Set(
        (globalReadRecords || []).map((r) => String((r as Record<string, unknown>).announcement_id || ""))
      );

      globalMapped = globalRows.map((row) => {
        const mapped = row as Record<string, unknown>;
        const id = String(mapped.id || "");
        return {
          id,
          title: String(mapped.title || ""),
          message: String(mapped.message || ""),
          createdAt: String(mapped.created_at || ""),
          isRead: globalReadSet.has(id),
          source: "global" as const,
        };
      });
    }

    const merged = [...tenantMapped, ...globalMapped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const alerts = merged.slice(0, 24);

    return NextResponse.json({
      alerts,
      meta: {
        tenantIsActive: true,
        minNativeBuild,
        liveUpdateChannel,
        liveUpdateBundleUrl,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
