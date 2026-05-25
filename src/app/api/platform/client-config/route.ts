import { NextResponse } from "next/server";
import { readPlatformSettingsRow, toPublicClientConfig } from "@/lib/data/platformSettings";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

/** Public read — native app + mobile web use this for OTA manifest URL and APK link. */
export async function GET() {
  try {
    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json({ error: "Service role is not configured" }, { status: 500 });
    }

    const row = await readPlatformSettingsRow(svc);
    const config = toPublicClientConfig(row);

    return NextResponse.json(config, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
