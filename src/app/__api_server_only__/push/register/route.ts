import { NextResponse } from "next/server";
import type { DevicePushRegistration } from "@/lib/push/types";

/**
 * Stores a device push token for the signed-in user.
 * TODO: persist to DB (device_push_tokens) once migrations are added — see docs/PUSH_NOTIFICATIONS.md.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
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
    return NextResponse.json({ error: "token and platform are required" }, { status: 400 });
  }

  // Scaffold: accept and log until persistence layer ships.
  if (process.env.NODE_ENV !== "production") {
    console.info("[push/register] token received", {
      platform,
      tenantSlug: body.tenantSlug ?? null,
      categories: body.categories ?? [],
      tokenPreview: `${token.slice(0, 8)}…`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Push registration accepted (storage pending database migration).",
  });
}
