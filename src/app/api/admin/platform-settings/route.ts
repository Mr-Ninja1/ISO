import { NextResponse } from "next/server";
import {
  patchToRow,
  readPlatformSettingsRow,
  toAdminPlatformSettings,
  type PlatformSettingsPatch,
} from "@/lib/data/platformSettings";
import { requirePlatformDeveloper } from "@/lib/platformDevelopers";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

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

    const row = await readPlatformSettingsRow(svc);
    return NextResponse.json(toAdminPlatformSettings(row));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await requirePlatformDeveloper(token);
    const svc = createServiceRoleSupabase();
    if (!svc) return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });

    const body = (await req.json().catch(() => null)) as PlatformSettingsPatch | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const patch = patchToRow(body);
    const { data, error } = await svc
      .from("platform_settings")
      .upsert({ id: "default", ...patch }, { onConflict: "id" })
      .select("id, min_native_build, live_update_channel, live_update_bundle_url, latest_apk_url, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(toAdminPlatformSettings(data));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status?: number }).status! : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
