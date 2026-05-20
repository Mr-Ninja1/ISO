/**
 * Next.js standalone output does not include .next/static or public by default.
 * Without this copy step, `npm run start:standalone` serves HTML with no CSS/JS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");

function copyDir(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-standalone-static] Skip ${label}: missing ${src}`);
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-standalone-static] Copied ${label} -> ${dest}`);
  return true;
}

if (!fs.existsSync(standaloneDir)) {
  console.error("[copy-standalone-static] No .next/standalone — run `npm run build` first.");
  process.exit(1);
}

const staticOk = copyDir(staticSrc, path.join(standaloneDir, ".next", "static"), ".next/static");
copyDir(publicSrc, path.join(standaloneDir, "public"), "public");

if (!staticOk) {
  console.error("[copy-standalone-static] Build output incomplete — CSS will not load.");
  process.exit(1);
}
