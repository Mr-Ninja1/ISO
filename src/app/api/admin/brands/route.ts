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

    const [tenantsResult, membersResult, messagesResult] = await Promise.all([
      svc.from("tenants").select("id,name,slug,logo_url,created_at,updated_at,is_active").order("created_at", { ascending: false }),
      svc.from("tenant_members").select("tenant_id,user_id"),
      svc.from("tenant_announcements").select("id,tenant_id,title,message,created_at,is_active").order("created_at", { ascending: false }),
    ]);

    if (tenantsResult.error) return NextResponse.json({ error: tenantsResult.error.message }, { status: 500 });
    if (membersResult.error) return NextResponse.json({ error: membersResult.error.message }, { status: 500 });
    if (messagesResult.error) return NextResponse.json({ error: messagesResult.error.message }, { status: 500 });

    const memberCounts = new Map<string, number>();
    for (const row of membersResult.data || []) {
      const tenantId = String((row as Record<string, unknown>).tenant_id || "");
      if (!tenantId) continue;
      memberCounts.set(tenantId, (memberCounts.get(tenantId) || 0) + 1);
    }

    const latestMessageByTenant = new Map<string, { id: string; title: string; message: string; createdAt: string }>();
    for (const row of messagesResult.data || []) {
      const mapped = row as Record<string, unknown>;
      const tenantId = String(mapped.tenant_id || "");
      if (!tenantId || latestMessageByTenant.has(tenantId)) continue;
      latestMessageByTenant.set(tenantId, {
        id: String(mapped.id || ""),
        title: String(mapped.title || ""),
        message: String(mapped.message || ""),
        createdAt: String(mapped.created_at || ""),
      });
    }

    const brands = (tenantsResult.data || []).map((row) => {
      const tenant = row as Record<string, unknown>;
      const latest = latestMessageByTenant.get(String(tenant.id || "")) || null;
      return {
        id: String(tenant.id || ""),
        name: String(tenant.name || ""),
        slug: String(tenant.slug || ""),
        logoUrl: (tenant.logo_url as string | null) ?? null,
        createdAt: String(tenant.created_at || ""),
        updatedAt: String(tenant.updated_at || ""),
        isActive: tenant.is_active !== false,
        memberCount: memberCounts.get(String(tenant.id || "")) || 0,
        latestMessageAt: latest?.createdAt || null,
        latestMessageTitle: latest?.title || null,
        latestMessageBody: latest?.message || null,
      };
    });

    return NextResponse.json({ brands });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}