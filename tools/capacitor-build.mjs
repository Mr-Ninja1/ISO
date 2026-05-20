#!/usr/bin node
/**
 * Produces a static web bundle in `out/` for Capacitor (offline navigation).
 * API routes stay on the hosted backend; the native app calls them via NEXT_PUBLIC_API_BASE_URL.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "src", "app", "api");
const apiBackup = path.join(root, "src", "app", "__api_server_only__");
const outDir = path.join(root, "out");
const shellSlug = "_";

const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.CAPACITOR_API_BASE_URL?.trim() ||
  "https://isopro.me";

/** Embedded in the static bundle; bump per APK when native/plugins change. */
const nativeBuild =
  process.env.NEXT_PUBLIC_NATIVE_BUILD?.trim() ||
  process.env.CAPACITOR_NATIVE_BUILD?.trim() ||
  "1";

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function moveApiAside() {
  if (fs.existsSync(apiBackup) && !fs.existsSync(apiDir)) {
    fs.renameSync(apiBackup, apiDir);
  }
  if (!fs.existsSync(apiDir)) return;
  if (fs.existsSync(apiBackup)) {
    fs.rmSync(apiBackup, { recursive: true, force: true });
  }
  fs.renameSync(apiDir, apiBackup);
}

function restoreApi() {
  if (!fs.existsSync(apiBackup)) return;
  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
  fs.renameSync(apiBackup, apiDir);
}

function listHtmlFiles(dir, base = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listHtmlFiles(full, base));
    } else if (entry.name === "index.html") {
      files.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  return files;
}

/**
 * Capacitor serves files from disk. Any tenant slug in the URL needs a matching HTML file.
 * We mirror the placeholder slug `_` tree so runtime URLs like `/acme/audits/` resolve offline.
 */
function mirrorTenantShellRoutes() {
  const shellRoot = path.join(outDir, shellSlug);
  if (!fs.existsSync(shellRoot)) {
    console.warn(`[capacitor-build] No shell routes at out/${shellSlug}; skipping tenant mirror.`);
    return;
  }

  const shellRoutes = listHtmlFiles(shellRoot).map((relative) => path.dirname(relative));
  const uniqueRoutes = [...new Set(shellRoutes.filter((route) => route && route !== "."))];

  const tenantSlugs = new Set([shellSlug]);
  const fromEnv = process.env.CAPACITOR_TENANT_SLUGS?.split(",").map((s) => s.trim()).filter(Boolean) || [];
  for (const slug of fromEnv) tenantSlugs.add(slug);

  for (const slug of tenantSlugs) {
    if (slug === shellSlug) continue;
    for (const route of uniqueRoutes) {
      const sourceDir = path.join(shellRoot, route);
      const targetDir = path.join(outDir, slug, route);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
    }
  }

  console.log(
    `[capacitor-build] Mirrored ${uniqueRoutes.length} route(s) for ${tenantSlugs.size - 1} extra tenant slug(s).`,
  );
}

function writeCapacitorWebConfig() {
  const config = {
    appId: "com.isopro.app",
    appName: "ISO Pro",
    webDir: "out",
    bundledWebRuntime: false,
    plugins: {
      CapacitorHttp: {
        enabled: true,
      },
    },
    server: {
      androidScheme: "https",
      cleartext: false,
      errorPath: "workspace/index.html",
      allowNavigation: ["isopro.me", "*.isopro.me", "*.supabase.co"],
    },
  };
  fs.writeFileSync(path.join(root, "capacitor.config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

try {
  console.log(`[capacitor-build] API base: ${apiBase}`);
  if (!process.env.NEXT_PUBLIC_NATIVE_BUILD?.trim() && !process.env.CAPACITOR_NATIVE_BUILD?.trim()) {
    console.log("[capacitor-build] NEXT_PUBLIC_NATIVE_BUILD not set; using 1. Set it when shipping a new APK.");
  }
  moveApiAside();
  const nextDir = path.join(root, ".next");
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
  }
  run("npm", ["run", "build"], {
    CAPACITOR_BUILD: "1",
    NEXT_PUBLIC_API_BASE_URL: apiBase,
    NEXT_PUBLIC_CAPACITOR_APP: "1",
    NEXT_PUBLIC_NATIVE_BUILD: nativeBuild,
  });
  mirrorTenantShellRoutes();
  writeCapacitorWebConfig();
  run("npx", ["cap", "copy", "android"]);
  console.log("[capacitor-build] Done. Open Android Studio: npm run cap:open-android");
} finally {
  restoreApi();
}
