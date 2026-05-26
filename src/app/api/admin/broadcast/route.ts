import { NextResponse } from "next/server";
import { normalizeAnnouncementAudience } from "@/lib/platformAudience";
import { dispatchGlobalBroadcastPush } from "@/lib/push/dispatch";
import { isFcmConfigured } from "@/lib/push/fcm";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminUser = await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      message?: string;
      delivery?: string;
      audience?: string;
    };

    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const deliveryRaw = String(body.delivery || "modal").trim().toLowerCase();
    const delivery = deliveryRaw === "inbox" || deliveryRaw === "toast" ? deliveryRaw : "modal";
    const audience = normalizeAnnouncementAudience(body.audience);

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const { data: announcement, error } = await svc
      .from("global_announcements")
      .insert({
        title,
        message,
        created_by_email: adminUser?.email || null,
        is_active: true,
        delivery,
        audience,
      })
      .select("id,title,message,created_at,audience,delivery")
      .single();

    if (error || !announcement) {
      return NextResponse.json({ error: error?.message || "Failed to create broadcast" }, { status: 500 });
    }

    await svc.from("activity_logs").insert({
      user_id: adminUser?.id,
      action: "platform.broadcast.send",
      entity_type: "global_announcement",
      entity_id: announcement.id,
      details: { title, message, audience, delivery },
    });

    let pushResult: { sent: number; invalidRemoved?: number; skipped?: string } = {
      sent: 0,
      skipped: "fcm_not_configured",
    };
    if (isFcmConfigured()) {
      pushResult = await dispatchGlobalBroadcastPush({ title, message, audience });
    }

    return NextResponse.json({
      announcement,
      push: pushResult,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
