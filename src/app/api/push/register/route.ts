import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/supabase/routeAuth";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import type { DevicePushRegistration, PushNotificationCategory } from "@/lib/push/types";

const PUSH_CATEGORIES = new Set<PushNotificationCategory>([
  "reminder",
  "activity",
  "corrective_action",
  "audit_submitted",
  "staff_invite",
  "announcement",
  "system",
]);

function isPushCategory(value: unknown): value is PushNotificationCategory {
  return typeof value === "string" && PUSH_CATEGORIES.has(value as PushNotificationCategory);
}

async function resolveTenantId(tenantSlug: string | null | undefined) {
  const slug = String(tenantSlug || "").trim();
  if (!slug) return null;

  const svc = createServiceRoleSupabase();
  if (!svc) return null;

  const { data } = await svc
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Stores a device push token for the signed-in user. */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  const { user } = await getRouteUser(accessToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<DevicePushRegistration>;
  try {
    body = (await req.json()) as Partial<DevicePushRegistration>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = (body.token || "").trim();
  const platform = body.platform;
  if (!token || !platform) {
    return NextResponse.json(
      { error: "token and platform are required" },
      { status: 400 },
    );
  }

  const svc = createServiceRoleSupabase();
  if (!svc) {
    return NextResponse.json(
      { error: "Service role is not configured" },
      { status: 500 },
    );
  }

  const tenantId = await resolveTenantId(body.tenantSlug);
  const categories = Array.isArray(body.categories)
    ? body.categories.filter(isPushCategory)
    : [];

  const { error } = await svc.from("device_push_tokens").upsert(
    {
      user_id: user.id,
      tenant_id: tenantId,
      platform,
      token,
      device_id: body.deviceId ? String(body.deviceId) : null,
      categories,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to register device" },
      { status: 500 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[push/register] token stored", {
      userId: user.id,
      platform,
      tenantSlug: body.tenantSlug ?? null,
      categories,
      tokenPreview: `${token.slice(0, 8)}…`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Push registration saved.",
  });
}
