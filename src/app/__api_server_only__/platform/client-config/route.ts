import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

/**
 * Public read for native shell update checks (no auth).
 * Values are non-sensitive; min_native_build gates sideload reinstall prompts.
 */
export async function GET() {
  try {
    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json({
        minNativeBuild: null,
        liveUpdateChannel: null,
        liveUpdateBundleUrl: null,
        latestApkUrl: null,
      });
    }

    const { data, error } = await svc
      .from("platform_settings")
      .select("min_native_build, live_update_channel, live_update_bundle_url, latest_apk_url")
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({
        minNativeBuild: null,
        liveUpdateChannel: null,
        liveUpdateBundleUrl: null,
        latestApkUrl: null,
      });
    }

    const row = data as Record<string, unknown>;
    const min = row.min_native_build;
    const apk = row.latest_apk_url;
    return NextResponse.json({
      minNativeBuild: typeof min === "number" && Number.isFinite(min) ? min : null,
      liveUpdateChannel: typeof row.live_update_channel === "string" ? row.live_update_channel : null,
      liveUpdateBundleUrl: typeof row.live_update_bundle_url === "string" ? row.live_update_bundle_url : null,
      latestApkUrl: typeof apk === "string" && apk.trim() ? apk.trim() : null,
    });
  } catch {
    return NextResponse.json({
      minNativeBuild: null,
      liveUpdateChannel: null,
      liveUpdateBundleUrl: null,
      latestApkUrl: null,
    });
  }
}
