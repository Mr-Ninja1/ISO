import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PLATFORM_API_BASE_URL } from "@/lib/platform";
import { createServiceRoleSupabase } from "@/lib/supabase/serviceRole";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeployedOtaManifest = {
  bundleId: string;
  channel: string | null;
  manifestUrl: string;
  publishedAt: string | null;
};

async function readDeployedOtaManifest(): Promise<DeployedOtaManifest | null> {
  try {
    const manifestPath = path.join(process.cwd(), "public", "ota", "production", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const bundleId = typeof manifest.bundleId === "string" ? manifest.bundleId.trim() : "";
    const bundleUrl = typeof manifest.bundleUrl === "string" ? manifest.bundleUrl.trim() : "";
    if (!bundleId || !/^https:\/\//i.test(bundleUrl)) return null;
    return {
      bundleId,
      channel: typeof manifest.channel === "string" && manifest.channel.trim() ? manifest.channel.trim() : null,
      manifestUrl: new URL("/api/platform/ota-manifest", PLATFORM_API_BASE_URL).toString(),
      publishedAt: typeof manifest.publishedAt === "string" ? manifest.publishedAt : null,
    };
  } catch {
    return null;
  }
}

function deployedManifestIsNewer(
  deployed: DeployedOtaManifest | null,
  configuredUpdatedAt: unknown,
  configuredBundleId: unknown
): boolean {
  if (!deployed) return false;
  if (typeof configuredBundleId !== "string" || !configuredBundleId.trim()) return true;
  const deployedRun = /^ci\.(\d+)$/i.exec(deployed.bundleId);
  const configuredRun = typeof configuredBundleId === "string" ? /^ci\.(\d+)$/i.exec(configuredBundleId) : null;
  if (deployedRun && configuredRun) {
    return Number(deployedRun[1]) > Number(configuredRun[1]);
  }

  const publishedAt = deployed.publishedAt ? Date.parse(deployed.publishedAt) : NaN;
  const configuredAt = typeof configuredUpdatedAt === "string" ? Date.parse(configuredUpdatedAt) : NaN;
  return Number.isFinite(publishedAt) && (!Number.isFinite(configuredAt) || publishedAt > configuredAt);
}

function deployedFeedFields(deployed: DeployedOtaManifest | null) {
  return {
    liveUpdateChannel: deployed?.channel ?? null,
    liveUpdateBundleUrl: deployed?.manifestUrl ?? null,
    otaLatestBundleId: deployed?.bundleId ?? null,
  };
}

/**
 * Public read for native shell update checks (no auth).
 * Values are non-sensitive; min_native_build gates sideload reinstall prompts.
 */
export async function GET() {
  const deployedOta = await readDeployedOtaManifest();
  try {
    const svc = createServiceRoleSupabase();
    if (!svc) {
      return NextResponse.json(
        {
          minNativeBuild: null,
          ...deployedFeedFields(deployedOta),
          latestApkUrl: null,
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
          ...deployedFeedFields(deployedOta),
          latestApkUrl: null,
          updatedAt: null,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const row = data as Record<string, unknown>;
    const min = row.min_native_build;
    const apk = row.latest_apk_url;
    const useDeployedOta = deployedManifestIsNewer(
      deployedOta,
      row.updated_at,
      row.ota_latest_bundle_id
    );
    return NextResponse.json(
      {
        minNativeBuild: typeof min === "number" && Number.isFinite(min) ? min : null,
        liveUpdateChannel: useDeployedOta
          ? deployedOta?.channel ?? null
          : typeof row.live_update_channel === "string"
            ? row.live_update_channel
            : null,
        liveUpdateBundleUrl: useDeployedOta
          ? deployedOta?.manifestUrl ?? null
          : typeof row.live_update_bundle_url === "string"
            ? row.live_update_bundle_url
            : null,
        latestApkUrl: typeof apk === "string" && apk.trim() ? apk.trim() : null,
        otaLatestBundleId: useDeployedOta
          ? deployedOta?.bundleId ?? null
          : typeof row.ota_latest_bundle_id === "string" && row.ota_latest_bundle_id.trim()
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
        ...deployedFeedFields(deployedOta),
        latestApkUrl: null,
        updatedAt: null,
      },
      { headers: NO_STORE_HEADERS }
    );
  }
}
