#!/usr/bin node
/**
 * Copy the latest OTA bundle from ota-dist/ into public/ota/ for deployment with the Next.js site.
 * Zips are gitignored; manifest.json is committed so deploys can serve it from isopro.me.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const channel = (process.env.OTA_CHANNEL || "production").trim();
const srcDir = path.join(root, "ota-dist", channel);
const destDir = path.join(root, "public", "ota", channel);

if (!fs.existsSync(srcDir)) {
  console.error(`[publish-ota-public] Missing ${srcDir} — run npm run package:ota first.`);
  process.exit(1);
}

const manifestSrc = path.join(srcDir, "manifest.json");
if (!fs.existsSync(manifestSrc)) {
  console.error("[publish-ota-public] manifest.json not found in ota-dist.");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));
const zipName = path.basename(String(manifest.bundleUrl || "").split("/").pop() || "");
const zipSrc = zipName ? path.join(srcDir, zipName) : null;

fs.copyFileSync(manifestSrc, path.join(destDir, "manifest.json"));
console.log(`[publish-ota-public] manifest -> public/ota/${channel}/manifest.json`);

if (zipSrc && fs.existsSync(zipSrc)) {
  fs.copyFileSync(zipSrc, path.join(destDir, zipName));
  const mb = (fs.statSync(zipSrc).size / (1024 * 1024)).toFixed(1);
  console.log(`[publish-ota-public] ${zipName} (${mb} MB) -> public/ota/${channel}/`);
} else {
  console.warn("[publish-ota-public] Zip not found — manifest only.");
}

console.log("");
console.log("Deploy the web app (or upload public/ota/) so devices can reach:");
console.log(`  https://YOUR-HOST/ota/${channel}/manifest.json`);
