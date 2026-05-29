#!/usr/bin node
/**
 * Zip the Capacitor `out/` folder and write an OTA manifest for self-hosted live updates.
 *
 * Usage (after npm run build:capacitor):
 *   OTA_BUNDLE_ID=20260520.2 OTA_PUBLIC_BASE_URL=https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production npm run package:ota
 *
 * Upload ota-dist/production/* to your CDN/host, then set platform_settings.live_update_bundle_url
 * to the manifest URL in Supabase or the developer console.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const channel = (process.env.OTA_CHANNEL || "production").trim();
const bundleId = (process.env.OTA_BUNDLE_ID || defaultBundleId()).trim();
const publicBase = (process.env.OTA_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
const minNativeBuild = parseInt(process.env.OTA_MIN_NATIVE_BUILD || "1", 10);
const releaseNotes = (process.env.OTA_RELEASE_NOTES || "").trim();

const distDir = path.join(root, "ota-dist", channel);
const zipName = `bundle-${bundleId}.zip`;
const zipPath = path.join(distDir, zipName);

function defaultBundleId() {
  const fromCi = process.env.GITHUB_RUN_NUMBER?.trim();
  if (fromCi) return `ci.${fromCi}`;

  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${day}.${h}${min}`;
}

function zipOutFolder() {
  fs.mkdirSync(distDir, { recursive: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

  if (process.platform === "win32") {
    const ps = [
      "Compress-Archive",
      `-Path "${outDir.replace(/\\/g, "/")}/*"`,
      `-DestinationPath "${zipPath.replace(/\\/g, "/")}"`,
      "-Force",
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
    return;
  }

  const result = spawnSync("zip", ["-r", zipPath, "."], { cwd: outDir, stdio: "inherit" });
  if (result.status !== 0) {
    console.error("[package-ota] `zip` not found. Install zip or run on Windows with PowerShell.");
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(outDir)) {
  console.error("[package-ota] Missing out/ — run npm run build:capacitor first.");
  process.exit(1);
}

zipOutFolder();

const bundleUrl = publicBase ? `${publicBase}/${zipName}` : `https://YOUR-HOST/ota/${channel}/${zipName}`;
const manifestUrl = publicBase ? `${publicBase}/manifest.json` : `https://YOUR-HOST/ota/${channel}/manifest.json`;

const manifest = {
  bundleId,
  version: bundleId,
  channel,
  minNativeBuild: Number.isFinite(minNativeBuild) ? minNativeBuild : 1,
  bundleUrl,
  publishedAt: new Date().toISOString(),
  ...(releaseNotes ? { releaseNotes } : {}),
};

fs.writeFileSync(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log("");
console.log("[package-ota] Done.");
console.log(`  Channel:     ${channel}`);
console.log(`  Bundle ID:   ${bundleId}`);
console.log(`  Zip:         ${zipPath}`);
console.log(`  Manifest:    ${path.join(distDir, "manifest.json")}`);
console.log("");
console.log("Next steps:");
console.log("  1. Upload both files from ota-dist/" + channel + "/ to HTTPS hosting.");
console.log("  2. Set platform_settings.live_update_bundle_url to the manifest URL:");
console.log(`     ${manifestUrl}`);
console.log("  3. Set live_update_channel to:", channel);
console.log("  4. Open the app online — users get a restart prompt when a new bundle is downloaded.");
