import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultOtaManifestUrl } from "@/lib/siteOrigin";

export type PlatformSettingsRow = {
  id: string;
  min_native_build: number | null;
  live_update_channel: string | null;
  live_update_bundle_url: string | null;
  latest_apk_url: string | null;
  updated_at: string | null;
};

const DEFAULT_MANIFEST_URL = getDefaultOtaManifestUrl();

export async function readPlatformSettingsRow(
  svc: SupabaseClient
): Promise<PlatformSettingsRow | null> {
  const { data, error } = await svc
    .from("platform_settings")
    .select("id, min_native_build, live_update_channel, live_update_bundle_url, latest_apk_url, updated_at")
    .eq("id", "default")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PlatformSettingsRow | null) ?? null;
}

export function toPublicClientConfig(row: PlatformSettingsRow | null) {
  const minNativeBuild =
    typeof row?.min_native_build === "number" && Number.isFinite(row.min_native_build)
      ? row.min_native_build
      : 1;

  const liveUpdateChannel = (row?.live_update_channel || "production").trim() || "production";
  const liveUpdateBundleUrl = (row?.live_update_bundle_url || DEFAULT_MANIFEST_URL).trim() || DEFAULT_MANIFEST_URL;
  const latestApkUrl = (row?.latest_apk_url || "").trim() || null;

  return {
    minNativeBuild,
    liveUpdateChannel,
    liveUpdateBundleUrl,
    latestApkUrl,
    updatedAt: row?.updated_at ?? null,
  };
}

export function toAdminPlatformSettings(row: PlatformSettingsRow | null) {
  const base = toPublicClientConfig(row);
  return {
    minNativeBuild: base.minNativeBuild,
    liveUpdateChannel: base.liveUpdateChannel,
    liveUpdateBundleUrl: row?.live_update_bundle_url?.trim() || null,
    latestApkUrl: base.latestApkUrl,
    updatedAt: base.updatedAt,
  };
}

export type PlatformSettingsPatch = {
  minNativeBuild?: number;
  liveUpdateChannel?: string;
  liveUpdateBundleUrl?: string | null;
  latestApkUrl?: string | null;
};

export function patchToRow(patch: PlatformSettingsPatch): Partial<PlatformSettingsRow> {
  const row: Partial<PlatformSettingsRow> = { updated_at: new Date().toISOString() };
  if (typeof patch.minNativeBuild === "number" && Number.isFinite(patch.minNativeBuild)) {
    row.min_native_build = Math.max(1, Math.floor(patch.minNativeBuild));
  }
  if (typeof patch.liveUpdateChannel === "string") {
    row.live_update_channel = patch.liveUpdateChannel.trim() || "production";
  }
  if (patch.liveUpdateBundleUrl !== undefined) {
    const url = patch.liveUpdateBundleUrl?.trim() || null;
    row.live_update_bundle_url = url;
  }
  if (patch.latestApkUrl !== undefined) {
    row.latest_apk_url = patch.latestApkUrl?.trim() || null;
  }
  return row;
}
