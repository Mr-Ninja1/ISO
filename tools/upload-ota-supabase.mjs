#!/usr/bin node
/**
 * Publish ota-dist/production to a public Supabase Storage bucket and point platform_settings at it.
 * WebView can fetch this (CORS) unlike GitHub Releases download URLs.
 *
 * Usage: node tools/upload-ota-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const channel = (process.env.OTA_CHANNEL || "production").trim();
const srcDir = path.join(root, "ota-dist", channel);
const bucketName = (process.env.OTA_SUPABASE_BUCKET || "ota").trim();

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

loadEnvLocal();

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/+$/,
  ""
);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
if (!supabaseUrl || !serviceKey) {
  console.error("[upload-ota-supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const authHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

const manifestPath = path.join(srcDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`[upload-ota-supabase] Missing ${manifestPath} — run npm run release:ota first.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const zipName = path.basename(String(manifest.bundleUrl || "").split("/").pop() || "");
const zipPath = path.join(srcDir, zipName);
if (!zipName || !fs.existsSync(zipPath)) {
  console.error("[upload-ota-supabase] Bundle file not found:", zipPath);
  process.exit(1);
}

const bucketsRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, { headers: authHeaders });
const buckets = await bucketsRes.json();
if (!bucketsRes.ok) {
  console.error("[upload-ota-supabase] List buckets failed:", buckets);
  process.exit(1);
}

const existing = Array.isArray(buckets) ? buckets.find((b) => b.name === bucketName) : null;
if (!existing) {
  const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucketName, name: bucketName, public: true }),
  });
  const createBody = await createRes.text();
  if (!createRes.ok) {
    console.error("[upload-ota-supabase] Create bucket failed:", createRes.status, createBody);
    process.exit(1);
  }
  console.log("[upload-ota-supabase] Created public bucket:", bucketName);
} else if (!existing.public) {
  const upd = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketName}`, {
    method: "PUT",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ public: true }),
  });
  console.log("[upload-ota-supabase] Make public:", upd.status, await upd.text());
}

const publicBase = `${supabaseUrl}/storage/v1/object/public/${bucketName}`;
const zipObject = `${channel}/${zipName}`;
const manifestObject = `${channel}/manifest.json`;

manifest.bundleUrl = `${publicBase}/${zipObject}`;
const manifestUrl = `${publicBase}/${manifestObject}`;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

async function upload(objectPath, body, contentType) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucketName}/${objectPath}`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload ${objectPath} failed (${res.status}): ${text}`);
  }
  console.log("[upload-ota-supabase] Uploaded", objectPath);
}

await upload(zipObject, fs.readFileSync(zipPath), "application/zip");
await upload(manifestObject, JSON.stringify(manifest, null, 2), "application/json");

const patch = await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.default`, {
  method: "PATCH",
  headers: {
    ...authHeaders,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    live_update_bundle_url: manifestUrl,
    live_update_channel: channel,
    ota_latest_bundle_id: manifest.bundleId,
    updated_at: new Date().toISOString(),
  }),
});
const patchBody = await patch.text();
if (!patch.ok) {
  console.error("[upload-ota-supabase] platform_settings update failed:", patch.status, patchBody);
  process.exit(1);
}

console.log("");
console.log("[upload-ota-supabase] Published:");
console.log("  Manifest:", manifestUrl);
console.log("  Bundle:  ", manifest.bundleUrl);
console.log("  Bundle ID:", manifest.bundleId);
console.log(patchBody);
