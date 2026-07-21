import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

/**
 * Public read for native shell update checks (no auth).
 * Values are non-sensitive; min_native_build gates sideload reinstall prompts.
 */
export async function GET() {
  try {
    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json(
        {
          minNativeBuild: null,
          liveUpdateChannel: null,
          liveUpdateBundleUrl: null,
          latestApkUrl: null,
          otaLatestBundleId: null,
          updatedAt: null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await svc
      .from("platform_settings")
      .select(
        "min_native_build, live_update_channel, live_update_bundle_url, latest_apk_url, ota_latest_bundle_id, updated_at"
      )
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        {
          minNativeBuild: null,
          liveUpdateChannel: null,
          liveUpdateBundleUrl: null,
          latestApkUrl: null,
          otaLatestBundleId: null,
          updatedAt: null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const row = data as Record<string, unknown>;
    const min = row.min_native_build;
    const apk = row.latest_apk_url;
    return NextResponse.json(
      {
        minNativeBuild: typeof min === "number" && Number.isFinite(min) ? min : null,
        liveUpdateChannel: typeof row.live_update_channel === "string" ? row.live_update_channel : null,
        liveUpdateBundleUrl: typeof row.live_update_bundle_url === "string" ? row.live_update_bundle_url : null,
        latestApkUrl: typeof apk === "string" && apk.trim() ? apk.trim() : null,
        otaLatestBundleId:
          typeof row.ota_latest_bundle_id === "string" && row.ota_latest_bundle_id.trim()
            ? row.ota_latest_bundle_id.trim()
            : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        minNativeBuild: null,
        liveUpdateChannel: null,
        liveUpdateBundleUrl: null,
        latestApkUrl: null,
        otaLatestBundleId: null,
        updatedAt: null,
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}
