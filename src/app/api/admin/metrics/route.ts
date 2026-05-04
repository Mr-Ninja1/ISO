import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    // Get total brands
    const { count: totalBrands } = await svc.from("tenants").select("*", { count: "exact", head: true });

    // Get active brands
    const { count: activeBrands } = await svc.from("tenants").select("*", { count: "exact", head: true }).eq("is_active", true);

    // Get total users (tenant_members)
    const { count: totalUsers } = await svc.from("tenant_members").select("*", { count: "exact", head: true });

    // Get total announcements
    const { count: totalAnnouncements } = await svc.from("tenant_announcements").select("*", { count: "exact", head: true });

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentActivityCount } = await svc
      .from("activity_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    return NextResponse.json({
      totalBrands: totalBrands || 0,
      activeBrands: activeBrands || 0,
      totalUsers: totalUsers || 0,
      totalAnnouncements: totalAnnouncements || 0,
      recentActivityCount: recentActivityCount || 0,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
