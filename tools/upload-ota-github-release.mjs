#!/usr/bin node
/**
 * Publish ota-dist/production to a GitHub Release and update Supabase manifest URL.
 *
 * Usage:
 *   OTA_RELEASE_TAG=ota-test-20260529.ota-client-v1 node tools/upload-ota-github-release.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const channel = (process.env.OTA_CHANNEL || "production").trim();
const srcDir = path.join(root, "ota-dist", channel);
const tag = (process.env.OTA_RELEASE_TAG || "").trim();
const repo = (process.env.GITHUB_REPO || "Mr-Ninja1/ISO").trim();

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

if (!tag) {
  console.error("[upload-ota-github] Set OTA_RELEASE_TAG (e.g. ota-test-20260529.ota-client-v1)");
  process.exit(1);
}

const manifestPath = path.join(srcDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`[upload-ota-github] Missing ${manifestPath} — run npm run release:ota first.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const zipName = path.basename(String(manifest.bundleUrl || "").split("/").pop() || "");
const zipPath = path.join(srcDir, zipName);

if (!zipName || !fs.existsSync(zipPath)) {
  console.error("[upload-ota-github] Zip not found:", zipPath);
  process.exit(1);
}

const releaseBase = `https://github.com/${repo}/releases/download/${tag}`;
manifest.bundleUrl = `${releaseBase}/${zipName}`;
const manifestUrl = `${releaseBase}/manifest.json`;
const manifestUploadPath = path.join(srcDir, "manifest.json");
fs.writeFileSync(manifestUploadPath, `${JSON.stringify(manifest, null, 2)}\n`);

const notes = manifest.releaseNotes || `OTA bundle ${manifest.bundleId}`;
const notesFile = path.join(srcDir, ".release-notes.txt");
fs.writeFileSync(notesFile, `${notes}\n`);

function runGh(args) {
  const result = spawnSync("gh", args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function updateSupabaseManifestUrl() {
  loadEnvLocal();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/+$/,
    ""
  );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    console.warn("[upload-ota-github] Skipping Supabase update (missing SUPABASE_URL or service role key).");
    return;
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.default`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      live_update_bundle_url: manifestUrl,
      live_update_channel: channel,
      ota_latest_bundle_id: manifest.bundleId,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[upload-ota-github] Supabase update failed (${res.status}): ${text}`);
    return;
  }
  console.log("[upload-ota-github] Supabase live_update_bundle_url + ota_latest_bundle_id updated.");
}

console.log("[upload-ota-github] Creating release", tag);
runGh([
  "release",
  "create",
  tag,
  "--repo",
  repo,
  "--title",
  `OTA ${manifest.bundleId}`,
  "--notes-file",
  notesFile,
]);

console.log("[upload-ota-github] Uploading manifest + zip…");
runGh(["release", "upload", tag, "--repo", repo, manifestUploadPath, zipPath, "--clobber"]);

try {
  fs.rmSync(notesFile, { force: true });
} catch {
  // ignore
}

await updateSupabaseManifestUrl();

console.log("");
console.log("[upload-ota-github] Published:");
console.log("  Manifest:", manifestUrl);
console.log("  Bundle:  ", manifest.bundleUrl);
console.log("  Bundle ID:", manifest.bundleId);
