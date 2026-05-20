# Learn OTA — full process (ISO Pro)

This is the exact workflow we use. **Website deploy and OTA are separate.**

---

## The three layers

| Layer | What | When you change it |
|-------|------|-------------------|
| **1. APIs** | `https://isopro.me/api/...` (Supabase) | Deploy backend / env — same for browser and app |
| **2. Website** | Browser at `isopro.me` | `git push` → hosting build |
| **3. App UI (OTA)** | Zip in WebView | `npm run release:ota` → **upload zip** → manifest URL in Supabase |

OTA only updates **layer 3**. Layers 1–2 are independent.

---

## Step-by-step (what we run)

### Step 0 — You change code in the IDE

Example: edit `AppBundleLabel.tsx` so the banner text changes.  
Commit when ready (website + OTA can share the same commit).

### Step 1 — Build the mobile web bundle

```powershell
cd web
$env:NEXT_PUBLIC_API_BASE_URL="https://isopro.me"
$env:NEXT_PUBLIC_NATIVE_BUILD="1"              # must match APK
$env:APP_BUNDLE_LABEL="OTA-LESSON-v3"          # visible proof on workspace
npm run build:capacitor
```

**What this does:** exports static site to `out/`, copies into `android/` (you do **not** need to reinstall APK for OTA).

### Step 2 — Zip + manifest

```powershell
$env:OTA_BUNDLE_ID="20260521.lesson-v3"       # NEW id every release
$env:OTA_PUBLIC_BASE_URL="https://isopro.me/ota/production"
$env:OTA_RELEASE_NOTES="Lesson v3 — bolder green banner"
npm run package:ota
npm run publish:ota:public
```

**Output:**

- `public/ota/production/manifest.json` — tells the app *which* zip to download
- `public/ota/production/bundle-20260521.lesson-v3.zip` — the actual UI (~2 MB)

### Step 3 — Publish to HTTPS (critical)

**Both** must return 200 in a browser:

1. https://isopro.me/ota/production/manifest.json  
2. https://isopro.me/ota/production/bundle-XXXX.zip  

- `manifest.json` is usually committed in git and deploys with the site.  
- **`.zip` is gitignored** — upload via hosting panel, FTP, or CI artifact.

If manifest works but zip is **404**, the app will never finish OTA.

### Step 4 — Supabase points apps at manifest

Already set if you ran `supabase/ops/seed_ota_platform_settings.sql`:

```sql
live_update_bundle_url = 'https://isopro.me/ota/production/manifest.json'
live_update_channel = 'production'
min_native_build = 1
```

Or use **Developer console → Live update controls**.

### Step 5 — Phone / emulator (no new APK)

1. Open app **online**.
2. App calls `/api/platform/client-config` → gets manifest URL.
3. App fetches `manifest.json` → sees new `bundleId`.
4. App downloads zip → **“App update ready”** → **Restart now**.
5. Workspace shows **“✓ OTA bundle active: OTA-LESSON-v3”**.

Force-close and reopen if the prompt does not appear within ~30s.

---

## One command (steps 1–2 combined)

```powershell
$env:APP_BUNDLE_LABEL="OTA-LESSON-v3"
$env:OTA_BUNDLE_ID="20260521.lesson-v3"
$env:OTA_PUBLIC_BASE_URL="https://isopro.me/ota/production"
$env:NEXT_PUBLIC_API_BASE_URL="https://isopro.me"
$env:NEXT_PUBLIC_NATIVE_BUILD="1"
npm run release:ota
```

Then deploy + upload zip.

---

## Current production check (run anytime)

```powershell
# Manifest
Invoke-WebRequest https://isopro.me/ota/production/manifest.json

# Zip (must be 200, not 404)
Invoke-WebRequest https://isopro.me/ota/production/bundle-YOUR-ID.zip -Method Head

# Server config
Invoke-WebRequest https://isopro.me/api/platform/client-config
```

---

## When you need a new APK instead of OTA

- New Capacitor plugin, permissions, or native code change → new APK + bump `min_native_build`.
- UI / JS / CSS only → OTA is enough.
