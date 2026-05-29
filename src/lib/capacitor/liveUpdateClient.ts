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

/** @deprecated Use OTA_ACTIVATED_BUNDLE_KEY — kept for migration reads only. */
export const OTA_BUNDLE_STORAGE_KEY = "iso-ota-bundle-applied:v1";
export const OTA_ACTIVATED_BUNDLE_KEY = "iso-ota-bundle-activated:v1";
export const OTA_PENDING_BUNDLE_KEY = "iso-ota-bundle-pending:v1";
export const OTA_CHANNEL_ENV = process.env.NEXT_PUBLIC_OTA_CHANNEL?.trim() || "production";

export type OtaPendingBundle = {
  bundleId: string;
  releaseNotes?: string;
  downloadedAt: string;
};

export type OtaManifestDecision =
  | { action: "skip"; reason: "already_activated" | "channel_mismatch" | "native_build_too_old" }
  | { action: "prompt_restart"; pending: OtaPendingBundle }
  | { action: "download" };

let storageMigrated = false;

function migrateLegacyOtaStorage() {
  if (storageMigrated || typeof localStorage === "undefined") return;
  storageMigrated = true;
  try {
    const legacy = localStorage.getItem(OTA_BUNDLE_STORAGE_KEY);
    const activated = localStorage.getItem(OTA_ACTIVATED_BUNDLE_KEY);
    if (legacy && !activated) {
      localStorage.setItem(OTA_ACTIVATED_BUNDLE_KEY, legacy);
    }
  } catch {
    // ignore
  }
}

export function parseNativeBuild(): number {
  const raw = process.env.NEXT_PUBLIC_NATIVE_BUILD;
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function readActivatedBundleId(): string | null {
  migrateLegacyOtaStorage();
  try {
    return localStorage.getItem(OTA_ACTIVATED_BUNDLE_KEY);
  } catch {
    return null;
  }
}

/** @deprecated Prefer readActivatedBundleId */
export function readAppliedBundleId(): string | null {
  return readActivatedBundleId();
}

export function writeActivatedBundleId(bundleId: string) {
  migrateLegacyOtaStorage();
  try {
    localStorage.setItem(OTA_ACTIVATED_BUNDLE_KEY, bundleId);
    localStorage.removeItem(OTA_BUNDLE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** @deprecated Prefer writeActivatedBundleId */
export function writeAppliedBundleId(bundleId: string) {
  writeActivatedBundleId(bundleId);
}

export function readPendingOtaBundle(): OtaPendingBundle | null {
  migrateLegacyOtaStorage();
  try {
    const raw = localStorage.getItem(OTA_PENDING_BUNDLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OtaPendingBundle;
    if (!parsed?.bundleId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingOtaBundle(pending: OtaPendingBundle) {
  migrateLegacyOtaStorage();
  try {
    localStorage.setItem(OTA_PENDING_BUNDLE_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

export function clearPendingOtaBundle() {
  try {
    localStorage.removeItem(OTA_PENDING_BUNDLE_KEY);
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

export function evaluateOtaManifest(args: {
  manifest: OtaManifest;
  configuredChannel: string | null;
  currentNativeBuild: number;
  activatedBundleId: string | null;
  pendingBundle: OtaPendingBundle | null;
}): OtaManifestDecision {
  const { manifest, configuredChannel, currentNativeBuild, activatedBundleId, pendingBundle } = args;

  if (manifest.minNativeBuild != null && currentNativeBuild > 0 && currentNativeBuild < manifest.minNativeBuild) {
    return { action: "skip", reason: "native_build_too_old" };
  }

  const channel = (configuredChannel || OTA_CHANNEL_ENV || "production").trim();
  if (manifest.channel && manifest.channel !== channel) {
    return { action: "skip", reason: "channel_mismatch" };
  }

  if (activatedBundleId === manifest.bundleId) {
    return { action: "skip", reason: "already_activated" };
  }

  if (pendingBundle?.bundleId === manifest.bundleId) {
    return { action: "prompt_restart", pending: pendingBundle };
  }

  return { action: "download" };
}

/** @deprecated Prefer evaluateOtaManifest */
export function shouldApplyOtaManifest(args: {
  manifest: OtaManifest;
  configuredChannel: string | null;
  currentNativeBuild: number;
  appliedBundleId: string | null;
}) {
  const decision = evaluateOtaManifest({
    manifest: args.manifest,
    configuredChannel: args.configuredChannel,
    currentNativeBuild: args.currentNativeBuild,
    activatedBundleId: args.appliedBundleId,
    pendingBundle: null,
  });
  if (decision.action === "download") return { apply: true as const };
  if (decision.action === "skip") return { apply: false as const, reason: decision.reason };
  return { apply: false as const, reason: "already_activated" as const };
}
