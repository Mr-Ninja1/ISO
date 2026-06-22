#!/usr/bin node
/**
 * Golden APK + matching OTA release.
 *
 * Ships one stable native shell (APK) and pairs it with an OTA bundle that requires
 * the same minNativeBuild. Future website changes should use release:ota only.
 *
 * Usage:
 *   npm run release:golden
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidGradle = path.join(root, "android", "app", "build.gradle");
const azureHost = "iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net";

function readVersionCode() {
  const gradle = fs.readFileSync(androidGradle, "utf8");
  const match = gradle.match(/versionCode\s+(\d+)/);
  if (!match) throw new Error("Could not read versionCode from android/app/build.gradle");
  return match[1];
}

function readVersionName() {
  const gradle = fs.readFileSync(androidGradle, "utf8");
  const match = gradle.match(/versionName\s+"([^"]+)"/);
  return match?.[1] || "unknown";
}

function run(label, command, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const versionCode = readVersionCode();
const versionName = readVersionName();
const bundleId = `golden.${versionCode}.${Date.now()}`;

const goldenEnv = {
  NEXT_PUBLIC_NATIVE_BUILD: versionCode,
  NEXT_PUBLIC_APP_BUNDLE_LABEL: `Golden APK v${versionName} (build ${versionCode})`,
  OTA_BUNDLE_ID: bundleId,
  OTA_MIN_NATIVE_BUILD: versionCode,
  OTA_CHANNEL: "production",
  OTA_PUBLIC_BASE_URL: `https://${azureHost}/ota/production`,
  OTA_RELEASE_NOTES: `Golden baseline build ${versionCode} — stable shell; ship web fixes via OTA after this.`,
};

console.log("[golden-release] ISO Grid golden baseline");
console.log(`  APK versionCode: ${versionCode}`);
console.log(`  APK versionName: ${versionName}`);
console.log(`  OTA bundleId:    ${bundleId}`);
console.log(`  OTA minNative:   ${versionCode}`);

run("Golden APK", "node", ["tools/package-android-apk.mjs"], goldenEnv);

// Re-use out/ from APK build — package OTA without rebuilding.
run("OTA bundle (matches golden APK)", "node", ["tools/package-ota-bundle.mjs"], goldenEnv);
run("Publish OTA to public/ota/production", "node", ["tools/publish-ota-public.mjs"], goldenEnv);

console.log("\n[golden-release] Done.");
console.log("  APK: dist/iso-grid.apk");
console.log(`  OTA: public/ota/production/manifest.json (bundle ${bundleId})`);
console.log("\nNext steps:");
console.log("  1. Install dist/iso-grid.apk on devices (or upload to GitHub Releases).");
console.log("  2. Deploy the website so public/ota/production/ is live on Azure.");
console.log("  3. In Supabase platform_settings set:");
console.log(`     min_native_build = ${versionCode}`);
console.log(`     live_update_bundle_url = https://${azureHost}/ota/production/manifest.json`);
console.log("  4. For future web-only fixes: npm run release:ota (no new APK).");
