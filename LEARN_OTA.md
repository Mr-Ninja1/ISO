# Learn OTA — full process (ISO Grid)

This is the exact workflow we use. **Website and OTA ship on the same `git push` to `main`.**

---

## The three layers

| Layer | What | When you change it |
|-------|------|-------------------|
| **1. APIs** | `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/api/...` (Supabase) | Deploy backend / env — same for browser and app |
| **2. Website** | Browser at `iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net` | `git push` → GitHub Actions → Azure |
| **3. App UI (OTA)** | Zip in WebView | **Same push** — CI runs `release:ota:ci` and deploys `public/ota/production/` |

OTA only updates **layer 3** on the phone. Layers 1–2 use the same deploy; you do not upload zips by hand anymore.

---

## Step-by-step (what we run)

### Step 0 — You change code in the IDE

Commit when ready (website + OTA can share the same commit).

### Step 1 — Build the mobile web bundle

```powershell
cd web
$env:NEXT_PUBLIC_API_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net"
$env:NEXT_PUBLIC_NATIVE_BUILD="1"              # must match APK
npm run build:capacitor
```

**What this does:** exports static site to `out/`, copies into `android/` (you do **not** need to reinstall APK for OTA).

### Step 2 — Zip + manifest

```powershell
$env:OTA_BUNDLE_ID="20260521.lesson-v3"       # NEW id every release
$env:OTA_PUBLIC_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production"
$env:OTA_RELEASE_NOTES="Lesson v3 — bolder green banner"
npm run package:ota
npm run publish:ota:public
```

**Output:**

- `public/ota/production/manifest.json` — tells the app *which* zip to download
- `public/ota/production/bundle-20260521.lesson-v3.zip` — the actual UI (~2 MB)

### Step 3 — Publish to HTTPS (automatic on `main`)

GitHub Actions builds the zip and copies it into the deploy bundle. After deploy, **both** must return 200:

1. https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production/manifest.json  
2. https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production/bundle-ci.RUN_NUMBER.zip  

- Zips are **gitignored** locally but **built in CI** every deploy.  
- Manual upload is only needed if you skip CI or deploy OTA files elsewhere.

If manifest works but zip is **404**, check the latest Actions run (OTA build step failed or deploy did not include `public/ota/`).

### Step 4 — Supabase points apps at manifest

Already set if you ran `supabase/ops/seed_ota_platform_settings.sql`:

```sql
live_update_bundle_url = 'https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production/manifest.json'
live_update_channel = 'production'
min_native_build = 1
```

Or use **Developer console → Live update controls**.

### Step 5 — Phone / emulator (no new APK)

1. Open app **online**.
2. App calls `/api/platform/client-config` → gets manifest URL.
3. App fetches `manifest.json` → sees new `bundleId`.
4. App downloads zip → **“App update ready”** → **Restart now**.
5. Confirm the update in the app (e.g. a fix you shipped in that deploy).

The restart prompt usually appears within ~30s while the app is open and online. If not, bring the app to the foreground or force-close and reopen — `LiveUpdateBootstrap` checks on launch and when the device reports `online`.

---

## One command (steps 1–2 combined)

```powershell
$env:OTA_BUNDLE_ID="20260521.lesson-v3"
$env:OTA_PUBLIC_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production"
$env:NEXT_PUBLIC_API_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net"
$env:NEXT_PUBLIC_NATIVE_BUILD="1"
npm run release:ota
```

Then `git push` to `main` (CI deploys zip + manifest) — no manual upload.

---

## What CI does (`.github/workflows/main_iso-pro.yml`)

On each `main` push:

1. `npm run release:ota:ci` with `OTA_BUNDLE_ID=ci.<run_number>`, `SKIP_CAP_SYNC=1`
2. Verifies `public/ota/production/manifest.json` and `bundle-ci.<run>.zip` exist
3. `npm run build` (standalone website)
4. `cp -R public deploy-bundle/public` → Azure

Phones still read the manifest URL from Supabase (`live_update_bundle_url`).

---

## Current production check (run anytime)

```powershell
# Manifest
Invoke-WebRequest https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production/manifest.json

# Zip (must be 200, not 404)
Invoke-WebRequest https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/ota/production/bundle-YOUR-ID.zip -Method Head

# Server config
Invoke-WebRequest https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/api/platform/client-config
```

---

## When you need a new APK instead of OTA

- New Capacitor plugin, permissions, or native code change → new APK + bump `min_native_build`.
- UI / JS / CSS only → OTA is enough.
