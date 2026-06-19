import { NextResponse } from "next/server";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { sendPushNotificationToDevices } from "@/lib/push/firebaseAdmin";

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const developer = await requirePlatformDeveloper(token);
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      message?: string;
      deepLink?: string;
      tenantSlug?: string;
    };

    const title = String(body.title || "Test push").trim() || "Test push";
    const message =
      String(body.message || "This is a developer test notification.").trim() ||
      "This is a developer test notification.";
    const deepLink = String(body.deepLink || "/workspace").trim() || "/workspace";
    const tenantSlug = String(body.tenantSlug || "").trim() || undefined;

    const push = await sendPushNotificationToDevices({
      audience: "native",
      payload: {
        title,
        body: message,
        category: "system",
        tenantSlug,
        deepLink,
        data: {
          source: "developer_test",
          requestedBy: developer.email || developer.id,
        },
      },
    });

    return NextResponse.json({ ok: true, push });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status =
      typeof (error as { status?: number }).status === "number"
        ? (error as { status?: number }).status!
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
