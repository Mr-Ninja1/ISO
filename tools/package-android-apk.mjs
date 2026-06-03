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
const androidGradle = path.join(androidDir, "app", "build.gradle");

/** Read versionCode from android/app/build.gradle so embedded NEXT_PUBLIC_NATIVE_BUILD matches min_native_build. */
function readAndroidVersionCode() {
  try {
    const gradle = fs.readFileSync(androidGradle, "utf8");
    const match = gradle.match(/versionCode\s+(\d+)/);
    if (match) return match[1];
  } catch {
    // ignore
  }
  return null;
}

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const versionCode = readAndroidVersionCode();
const nativeBuildEnv = {
  ...process.env,
  ...(versionCode && !process.env.NEXT_PUBLIC_NATIVE_BUILD?.trim()
    ? { NEXT_PUBLIC_NATIVE_BUILD: versionCode }
    : {}),
};

if (versionCode && !process.env.NEXT_PUBLIC_NATIVE_BUILD?.trim()) {
  console.log(`[package:apk] Using NEXT_PUBLIC_NATIVE_BUILD=${versionCode} (from android versionCode)`);
}

console.log("=== Brand assets (icons + Android splash) ===");
run("node", ["tools/generate-icons.js"]);
run("node", ["tools/generate-android-splash.js"]);

console.log("=== Capacitor static build ===");
run("node", ["tools/capacitor-build.mjs"], root, nativeBuildEnv);

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
