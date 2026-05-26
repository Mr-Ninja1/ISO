import { NextResponse } from "next/server";
import { listTenantAlertsForUser } from "@/lib/data/listTenantAlerts";
import type { PlatformClientKind } from "@/lib/platformAudience";
import { getBearerToken, getRouteUser } from "@/lib/supabase/routeAuth";

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user, supabase } = await getRouteUser(token);
    if (!user || !supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const tenantSlug = (url.searchParams.get("tenantSlug") || "").trim();
    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug is required" }, { status: 400 });
    }

    const clientParam = url.searchParams.get("client");
    const clientKind: PlatformClientKind =
      clientParam === "native" || clientParam === "web" ? clientParam : "web";

    const { alerts } = await listTenantAlertsForUser(supabase, user.id, tenantSlug, clientKind);

    return NextResponse.json({
      alerts,
      meta: {
        tenantSlug,
        client: clientKind,
        count: alerts.length,
        unread: alerts.filter((a) => !a.isRead).length,
      },
    });
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    if (err.code === "TENANT_DEACTIVATED") {
      return NextResponse.json(
        { error: err.message, code: err.code, deactivationReason: null },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status });
  }
}
