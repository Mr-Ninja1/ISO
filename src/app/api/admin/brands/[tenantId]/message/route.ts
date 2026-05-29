import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { sendPushNotificationToDevices } from "@/lib/push/firebaseAdmin";

function getBearerToken(req: Request) {
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const { tenantId } = await params;
    const token = getBearerToken(req);
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tenantId)
      return NextResponse.json({ error: "Missing tenant id" }, { status: 400 });

    const adminUser = await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc)
      return NextResponse.json(
        { error: "Service role is not configured" },
        { status: 500 },
      );

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      message?: string;
      delivery?: string;
    };
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const deliveryRaw = String(body.delivery || "modal")
      .trim()
      .toLowerCase();
    const delivery =
      deliveryRaw === "inbox" || deliveryRaw === "toast"
        ? deliveryRaw
        : "modal";
    if (!title || !message) {
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 },
      );
    }

    const { data: alert, error } = await svc
      .from("tenant_announcements")
      .insert({
        tenant_id: tenantId,
        title,
        message,
        created_by_email: adminUser?.email || null,
        is_active: true,
        delivery,
      })
      .select("id,tenant_id,title,message,created_at,is_active")
      .single();

    if (error || !alert) {
      return NextResponse.json(
        { error: error?.message || "Failed to create alert" },
        { status: 500 },
      );
    }

    await svc.from("activity_logs").insert({
      tenant_id: tenantId,
      user_id: adminUser?.id,
      action: "brand.message.send",
      entity_type: "tenant_announcement",
      entity_id: alert.id,
      details: {
        title,
        message,
        createdBy: adminUser?.email || null,
      },
    });

    const { data: tenantRow } = await svc
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const tenantSlug =
      typeof tenantRow?.slug === "string" ? tenantRow.slug : null;

    const push = await sendPushNotificationToDevices({
      tenantId,
      audience: "native",
      payload: {
        title,
        body: message,
        category: "announcement",
        tenantSlug: tenantSlug || undefined,
        deepLink: tenantSlug ? `/${tenantSlug}/dashboard` : "/workspace",
        data: {
          source: "tenant_announcement",
          announcementId: String(alert.id || ""),
          tenantId,
        },
      },
    });

    return NextResponse.json({ alert, push });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status =
      typeof (error as { status?: number }).status === "number"
        ? (error as { status?: number }).status!
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
