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

const azureHost = "iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net";
const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.CAPACITOR_API_BASE_URL?.trim() ||
  `https://${azureHost}`;

/** Embedded in the static bundle; bump per APK when native/plugins change. */
const nativeBuild =
  process.env.NEXT_PUBLIC_NATIVE_BUILD?.trim() ||
  process.env.CAPACITOR_NATIVE_BUILD?.trim() ||
  "1";

/** Visible on native workspace — use different values for APK vs OTA to verify updates. */
const appBundleLabel =
  process.env.NEXT_PUBLIC_APP_BUNDLE_LABEL?.trim() ||
  process.env.APP_BUNDLE_LABEL?.trim() ||
  "";

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

/** Copy + delete avoids EPERM on Windows when the IDE locks src/app/api. */
function moveApiAside() {
  if (fs.existsSync(apiBackup) && !fs.existsSync(apiDir)) {
    fs.cpSync(apiBackup, apiDir, { recursive: true });
    fs.rmSync(apiBackup, { recursive: true, force: true });
  }
  if (!fs.existsSync(apiDir)) return;
  if (fs.existsSync(apiBackup)) {
    fs.rmSync(apiBackup, { recursive: true, force: true });
  }
  fs.cpSync(apiDir, apiBackup, { recursive: true });
  fs.rmSync(apiDir, { recursive: true, force: true });
}

function restoreApi() {
  if (!fs.existsSync(apiBackup)) return;
  if (fs.existsSync(apiDir)) {
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
  fs.cpSync(apiBackup, apiDir, { recursive: true });
  fs.rmSync(apiBackup, { recursive: true, force: true });
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
    appId: "com.isogrid.app",
    appName: "ISO Grid",
    webDir: "out",
    bundledWebRuntime: false,
    plugins: {
      CapacitorHttp: {
        enabled: true,
      },
      LiveUpdate: {
        readyTimeout: 30000,
      },
    },
    server: {
      androidScheme: "https",
      cleartext: false,
      allowNavigation: [azureHost, "*.azurewebsites.net", "*.supabase.co"],
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
    try {
      fs.rmSync(nextDir, { recursive: true, force: true });
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? err.code : "";
      if (code === "EBUSY" || code === "EPERM") {
        console.warn("[capacitor-build] Could not clear .next (file locked). Stop npm start / close Android Studio, or continue with incremental build.");
        try {
          fs.rmSync(path.join(nextDir, "cache"), { recursive: true, force: true });
        } catch {
          // ignore
        }
      } else {
        throw err;
      }
    }
  }
  // Capacitor uses static export (out/) — do not run standalone copy step.
  run("npx", ["next", "build", "--webpack"], {
    CAPACITOR_BUILD: "1",
    NEXT_PUBLIC_API_BASE_URL: apiBase,
    NEXT_PUBLIC_CAPACITOR_APP: "1",
    NEXT_PUBLIC_NATIVE_BUILD: nativeBuild,
    ...(appBundleLabel ? { NEXT_PUBLIC_APP_BUNDLE_LABEL: appBundleLabel } : {}),
  });
  if (appBundleLabel) {
    console.log(`[capacitor-build] App bundle label: ${appBundleLabel}`);
  }
  mirrorTenantShellRoutes();

  const skipCapSync =
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.SKIP_CAP_SYNC === "1";

  if (skipCapSync) {
    console.log("[capacitor-build] CI mode — skipping cap copy (OTA-only build).");
  } else {
    writeCapacitorWebConfig();
    run("npx", ["cap", "copy", "android"]);
    console.log("[capacitor-build] Done. Open Android Studio: npm run cap:open-android");
  }
} finally {
  restoreApi();
}
