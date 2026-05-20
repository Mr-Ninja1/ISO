/** OTA manifest hosted at platform_settings.live_update_bundle_url (HTTPS JSON). */
export type OtaManifest = {
  bundleId: string;
  version?: string;
  channel?: string;
  minNativeBuild?: number;
  bundleUrl: string;
  publishedAt?: string;
  releaseNotes?: string;
};

export const OTA_BUNDLE_STORAGE_KEY = "iso-ota-bundle-applied:v1";
export const OTA_CHANNEL_ENV = process.env.NEXT_PUBLIC_OTA_CHANNEL?.trim() || "production";

export function parseNativeBuild(): number {
  const raw = process.env.NEXT_PUBLIC_NATIVE_BUILD;
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function readAppliedBundleId(): string | null {
  try {
    return localStorage.getItem(OTA_BUNDLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeAppliedBundleId(bundleId: string) {
  try {
    localStorage.setItem(OTA_BUNDLE_STORAGE_KEY, bundleId);
  } catch {
    // ignore
  }
}

export function parseOtaManifest(raw: unknown): OtaManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const bundleId = String(row.bundleId || row.version || "").trim();
  const bundleUrl = String(row.bundleUrl || row.url || "").trim();
  if (!bundleId || !bundleUrl) return null;

  const minNativeBuild =
    typeof row.minNativeBuild === "number" && Number.isFinite(row.minNativeBuild)
      ? row.minNativeBuild
      : undefined;

  return {
    bundleId,
    version: typeof row.version === "string" ? row.version : bundleId,
    channel: typeof row.channel === "string" ? row.channel : undefined,
    minNativeBuild,
    bundleUrl,
    publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : undefined,
    releaseNotes: typeof row.releaseNotes === "string" ? row.releaseNotes : undefined,
  };
}

export function shouldApplyOtaManifest(args: {
  manifest: OtaManifest;
  configuredChannel: string | null;
  currentNativeBuild: number;
  appliedBundleId: string | null;
}) {
  const { manifest, configuredChannel, currentNativeBuild, appliedBundleId } = args;

  if (manifest.minNativeBuild != null && currentNativeBuild > 0 && currentNativeBuild < manifest.minNativeBuild) {
    return { apply: false as const, reason: "native_build_too_old" as const };
  }

  const channel = (configuredChannel || OTA_CHANNEL_ENV || "production").trim();
  if (manifest.channel && manifest.channel !== channel) {
    return { apply: false as const, reason: "channel_mismatch" as const };
  }

  if (appliedBundleId === manifest.bundleId) {
    return { apply: false as const, reason: "already_applied" as const };
  }

  return { apply: true as const };
}
