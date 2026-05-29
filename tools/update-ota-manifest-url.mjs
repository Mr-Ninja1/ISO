#!/usr/bin node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestUrl = process.argv[2]?.trim();
const bundleIdArg = process.argv[3]?.trim();

if (!manifestUrl) {
  console.error("Usage: node tools/update-ota-manifest-url.mjs <manifest-url> [bundle-id]");
  process.exit(1);
}

let bundleId = bundleIdArg || "";
if (!bundleId && manifestUrl.includes("releases/download/")) {
  try {
    const manifestRes = await fetch(manifestUrl, { cache: "no-store" });
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      bundleId = String(manifest?.bundleId || manifest?.version || "").trim();
    }
  } catch {
    // ignore
  }
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

const res = await fetch(`${supabaseUrl}/rest/v1/platform_settings?id=eq.default`, {
  method: "PATCH",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
    body: JSON.stringify({
      live_update_bundle_url: manifestUrl,
      live_update_channel: "production",
      ...(bundleId ? { ota_latest_bundle_id: bundleId } : {}),
      updated_at: new Date().toISOString(),
    }),
});

const body = await res.text();
if (!res.ok) {
  console.error("Supabase update failed:", res.status, body);
  process.exit(1);
}
console.log("Updated platform_settings.live_update_bundle_url to:");
console.log(manifestUrl);
console.log(body);
