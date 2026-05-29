#!/usr/bin node
/**
 * Build Capacitor static bundle, sync Android, and produce a release APK.
 * Output: android/app/build/outputs/apk/release/app-release.apk
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const gradlew = process.platform === "win32" ? "gradlew.bat" : "gradlew";
const releaseApk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
const distApk = path.join(root, "dist", "iso-grid.apk");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("=== Brand assets (icons + Android splash) ===");
run("node", ["tools/generate-icons.js"]);
run("node", ["tools/generate-android-splash.js"]);

console.log("=== Capacitor static build ===");
run("node", ["tools/capacitor-build.mjs"]);

console.log("=== Capacitor sync (Android) ===");
run("npx", ["cap", "sync", "android"]);

if (!fs.existsSync(path.join(androidDir, gradlew))) {
  console.error("Android project or gradlew not found. Run: npm run cap:add-android");
  process.exit(1);
}

console.log("=== Gradle assembleRelease ===");
run(path.join(androidDir, gradlew), ["assembleRelease"], androidDir);

if (!fs.existsSync(releaseApk)) {
  console.error("Release APK not found at:", releaseApk);
  process.exit(1);
}

fs.mkdirSync(path.dirname(distApk), { recursive: true });
fs.copyFileSync(releaseApk, distApk);
console.log("\nRelease APK ready:");
console.log(" ", releaseApk);
console.log(" ", distApk);
console.log("\nUpload dist/iso-grid.apk to GitHub Releases and set NEXT_PUBLIC_ANDROID_APK_URL.");
