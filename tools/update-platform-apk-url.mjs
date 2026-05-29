#!/usr/bin node
/**
 * Set platform_settings.latest_apk_url (and optional min_native_build) in Supabase.
 *
 * Usage:
 *   node tools/update-platform-apk-url.mjs <apk-url> [min-native-build]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apkUrl = process.argv[2]?.trim();
const minBuildArg = process.argv[3]?.trim();

if (!apkUrl) {
  console.error("Usage: node tools/update-platform-apk-url.mjs <apk-url> [min-native-build]");
  process.exit(1);
}

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
  console.error("Missing SUPABASE_URL or service role key in .env.local");
  process.exit(1);
}

const patch = {
  latest_apk_url: apkUrl,
  updated_at: new Date().toISOString(),
};

if (minBuildArg) {
  const n = parseInt(minBuildArg, 10);
  if (Number.isFinite(n) && n > 0) patch.min_native_build = n;
}

const res = await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.default`, {
  method: "PATCH",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify(patch),
});

const body = await res.text();
if (!res.ok) {
  console.error("Supabase update failed:", res.status, body);
  process.exit(1);
}

console.log("Updated platform_settings:");
console.log(body);
