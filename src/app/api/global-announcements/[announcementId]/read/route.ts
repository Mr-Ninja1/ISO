import { NextResponse } from "next/server";
import { getBearerToken, getRouteUser, resolveSupabasePublicEnv } from "@/lib/supabase/routeAuth";
import { markAnnouncementRead } from "@/lib/data/markAnnouncementRead";

export async function POST(req: Request, { params }: { params: Promise<{ announcementId: string }> }) {
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
    if (!tenantSlug) {
      return NextResponse.json({ error: "tenantSlug query parameter is required" }, { status: 400 });
    }

    const { announcementId } = await params;

    await markAnnouncementRead({
      accessToken: token,
      user,
      tenantSlug,
      announcementId,
      source: "global",
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
