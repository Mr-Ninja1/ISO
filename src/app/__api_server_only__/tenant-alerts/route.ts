import { NextResponse } from "next/server";
import { tenantDeactivationReasonFromRow } from "@/lib/tenantDeactivation";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { createSupabaseWithBearer } from "@/lib/supabase/routeClient";
import { getBearerToken, getRouteUser, resolveSupabasePublicEnv } from "@/lib/supabase/routeAuth";
import { markAnnouncementRead } from "@/lib/data/markAnnouncementRead";
import {
  announcementAudienceMatches,
  type PlatformClientKind,
} from "@/lib/platformAudience";

type AlertRow = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  source: "tenant" | "global";
  delivery: "inbox" | "toast" | "modal";
};

function mapDelivery(value: unknown): AlertRow["delivery"] {
  if (value === "inbox" || value === "toast" || value === "modal") return value;
  return "modal";
}

async function resolveActiveTenant(sb: ReturnType<typeof createSupabaseWithBearer>, tenantSlug: string) {
  const { data: tenant, error: tenantErr } = await sb
    .from("tenants")
    .select("id,is_active,deactivation_reason")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantErr || !tenant) {
    return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
  }

  if ((tenant as Record<string, unknown>).is_active === false) {
    return {
      error: NextResponse.json(
        {
          error: "This brand has been deactivated",
          code: "TENANT_DEACTIVATED",
          deactivationReason: tenantDeactivationReasonFromRow(tenant as Record<string, unknown>),
        },
        { status: 403 }
      ),
    };
  }

  return { tenantId: String((tenant as Record<string, unknown>).id || "") };
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const env = resolveSupabasePublicEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const { user } = await getRouteUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const clientRaw = (url.searchParams.get("client") || "web").trim().toLowerCase();
    const client: PlatformClientKind = clientRaw === "native" ? "native" : "web";

    const sb = createSupabaseWithBearer(token);
    const tenantResult = await resolveActiveTenant(sb, tenantSlug);
    if ("error" in tenantResult && tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId!;

    const svc = createServiceRoleSupabase();
    let minNativeBuild: number | null = null;
    let liveUpdateChannel: string | null = null;
    let liveUpdateBundleUrl: string | null = null;
    let latestApkUrl: string | null = null;
    if (svc) {
      const { data: ps } = await svc
        .from("platform_settings")
        .select("min_native_build, live_update_channel, live_update_bundle_url, latest_apk_url")
        .eq("id", "default")
        .maybeSingle();
      if (ps) {
        const row = ps as Record<string, unknown>;
        const min = row.min_native_build;
        minNativeBuild = typeof min === "number" && Number.isFinite(min) ? min : null;
        liveUpdateChannel = typeof row.live_update_channel === "string" ? row.live_update_channel : null;
        liveUpdateBundleUrl = typeof row.live_update_bundle_url === "string" ? row.live_update_bundle_url : null;
        const apk = row.latest_apk_url;
        latestApkUrl = typeof apk === "string" && apk.trim() ? apk.trim() : null;
      }
    }

    const { data: tenantAlerts, error: tenantAlertsErr } = await sb
      .from("tenant_announcements")
      .select("id,title,message,created_at,delivery")
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
        delivery: mapDelivery(mapped.delivery),
      };
    });

    let globalMapped: AlertRow[] = [];
    const { data: globalRows, error: globalErr } = await sb
      .from("global_announcements")
      .select("id,title,message,created_at,delivery,audience")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(24);

    if (!globalErr && globalRows) {
      const filteredGlobal = globalRows.filter((row) =>
        announcementAudienceMatches((row as Record<string, unknown>).audience, client)
      );
      const gIds = filteredGlobal.map((row) => String((row as Record<string, unknown>).id || ""));
      const { data: globalReadRecords } = await sb
        .from("global_announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", gIds.length > 0 ? gIds : ["00000000-0000-0000-0000-000000000000"]);

      const globalReadSet = new Set(
        (globalReadRecords || []).map((r) => String((r as Record<string, unknown>).announcement_id || ""))
      );

      globalMapped = filteredGlobal.map((row) => {
        const mapped = row as Record<string, unknown>;
        const id = String(mapped.id || "");
        return {
          id,
          title: String(mapped.title || ""),
          message: String(mapped.message || ""),
          createdAt: String(mapped.created_at || ""),
          isRead: globalReadSet.has(id),
          source: "global" as const,
          delivery: mapDelivery(mapped.delivery),
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
        latestApkUrl,
        client,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Mark one alert read — same auth path as GET (workspace-style bearer client + RLS). */
export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const env = resolveSupabasePublicEnv();
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
    }

    const { user } = await getRouteUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as {
      announcementId?: string;
      source?: "tenant" | "global";
    };

    const announcementId = (body.announcementId || "").trim();
    const source = body.source === "global" ? "global" : "tenant";

    if (!announcementId) {
      return NextResponse.json({ error: "announcementId is required" }, { status: 400 });
    }

    await markAnnouncementRead({
      accessToken: token,
      user,
      tenantSlug,
      announcementId,
      source,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    if (err.code === "TENANT_DEACTIVATED") {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status });
  }
}
