import { NextResponse } from "next/server";
import { upsertDevicePushToken } from "@/lib/push/tokenRepository";
import type { DevicePushRegistration, PushPlatform } from "@/lib/push/types";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { getBearerToken, getRouteUser } from "@/lib/supabase/routeAuth";

function normalizePlatform(value: unknown): PushPlatform | null {
  if (value === "android" || value === "ios" || value === "web") return value;
  return null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { user } = await getRouteUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Partial<DevicePushRegistration>;
    try {
      body = (await req.json()) as Partial<DevicePushRegistration>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const fcmToken = (body.token || "").trim();
    const platform = normalizePlatform(body.platform);
    if (!fcmToken || !platform) {
      return NextResponse.json({ error: "token and platform are required" }, { status: 400 });
    }

    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });
    }

    let tenantId: string | null = null;
    const tenantSlug = (body.tenantSlug || "").trim();
    if (tenantSlug) {
      const { data: tenant } = await svc.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
      tenantId = tenant ? String((tenant as { id: string }).id) : null;
    }

    await upsertDevicePushToken(svc, {
      userId: user.id,
      tenantId,
      platform,
      token: fcmToken,
      deviceId: body.deviceId,
      categories: body.categories,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
