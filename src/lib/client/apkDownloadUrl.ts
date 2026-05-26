import { readCachedPlatformClientConfig } from "@/lib/capacitor/platformClientConfig";
import { ANDROID_APK_FILENAME } from "@/lib/branding";

/** Last-resort APK link when admin/env have not set a URL yet. */
export const DEFAULT_ANDROID_APK_URL = `https://github.com/Mr-Ninja1/ISO/releases/latest/download/${ANDROID_APK_FILENAME}`;

const ENV_APK_URL = (process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

export function resolveAndroidApkDownloadUrl(config?: { latestApkUrl?: string | null } | null): string {
  const fromConfig = (config?.latestApkUrl || "").trim();
  if (fromConfig) return fromConfig;
  if (ENV_APK_URL) return ENV_APK_URL;
  const cached = readCachedPlatformClientConfig()?.latestApkUrl;
  if (typeof cached === "string" && cached.trim()) return cached.trim();
  return DEFAULT_ANDROID_APK_URL;
}
