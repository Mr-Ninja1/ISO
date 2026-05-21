# Native app update guide (ISO Pro / Capacitor)

This guide explains **two ways** users get updates, when you must ship a **new APK**, and how the **admin console** settings connect to the **Download APK** button in the app.

For OTA-only details (manifest, zip, channels), see [OTA_SETUP.md](./OTA_SETUP.md).

---

## Quick answers

| Question | Answer |
|----------|--------|
| Does **Download APK** use the URL from the admin console? | **Yes.** The blocking update screen reads **`latest_apk_url`** from **Admin → Native app & OTA** (saved in `platform_settings`). If that field is empty, it falls back to **`NEXT_PUBLIC_ANDROID_APK_URL`** in your deploy env. |
| Do I increase the build number on every APK? | **Yes, for each new APK you publish.** Set `NEXT_PUBLIC_NATIVE_BUILD` when you build the Capacitor bundle (e.g. `4`, then `5`). That number is **baked into the APK**. Raise **Minimum native build** in the admin console when you want to **force** older APKs to update. |
| Do I increase the build number for OTA-only (web) updates? | **No.** OTA uses a new **bundleId** in `manifest.json`, not `NEXT_PUBLIC_NATIVE_BUILD`. |
| Who sees the mandatory update modal? | **Installed Capacitor apps only** (not the website). Users on build **&lt; min native build** see a fullscreen block until they install a newer APK. |

---

## Two update layers

```text
┌─────────────────────────────────────────────────────────────┐
│  APK (native shell)                                         │
│  Capacitor, Android plugins, permissions, WebView shell     │
│  Version: NEXT_PUBLIC_NATIVE_BUILD (integer, per APK)       │
│  User action: download APK → install → open app             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  OTA (web bundle inside the shell)                          │
│  HTML / JS / CSS in out/                                    │
│  Version: bundleId in manifest.json (per OTA release)       │
│  User action: in-app “Restart now” (no reinstall)           │
└─────────────────────────────────────────────────────────────┘
```

| Change type | What to do |
|-------------|------------|
| UI, forms, workspace logic, API client code | **OTA only** — push `main` or run `npm run release:ota` |
| New Capacitor plugin, Android permission, native dependency | **New APK** + bump build number + update admin settings |
| Force all old APKs to reinstall | Raise **Minimum native build** + set **Latest APK URL** |

---

## Admin console settings

Open **Developer / Admin** → **Native app & OTA** (`PlatformOtaPanel`).

| Field | Purpose |
|-------|---------|
| **Minimum native build** | Devices with embedded build **&lt; this value** are **blocked** and see the update modal. Set this to the **latest APK** build you want everyone on. |
| **Latest APK download URL** | HTTPS link opened when the user taps **Download APK** (e.g. GitHub Releases asset). |
| **Manifest URL** | OTA `manifest.json` URL (web-only updates inside existing APKs). |
| **OTA channel** | Must match `channel` in the manifest (usually `production`). |

**Download button wiring:** On app open, `NativeUpdateGate` calls `/api/platform/client-config` and uses `latestApkUrl` from the database. Whatever you save in **Latest APK download URL** is what the button opens (unless empty — then env fallback).

Optional env fallback (Azure / `.env`):

```env
NEXT_PUBLIC_ANDROID_APK_URL=https://github.com/Mr-Ninja1/ISO/releases/latest/download/iso-pro.apk
```

Prefer the **admin console URL** so you can change the release link **without redeploying the website**.

---

## Releasing a new APK (native build)

### 1. Bump the build number

Each new APK must have a **higher** `NEXT_PUBLIC_NATIVE_BUILD` than the previous one.

**PowerShell (before build):**

```powershell
cd web
$env:NEXT_PUBLIC_NATIVE_BUILD="5"
$env:NEXT_PUBLIC_API_BASE_URL="https://isopro.me"
```

**GitHub Actions** (`android-apk-release.yml` / `main_iso-pro.yml`) often sets this from `github.run_number` — keep that consistent so CI build numbers always increase.

### 2. Build the Capacitor bundle and APK

```powershell
npm run package:apk
```

Outputs:

- `android/app/build/outputs/apk/release/app-release.apk`
- `web/dist/iso-pro.apk` (copy for upload)

Or: `npm run build:capacitor` then Android Studio → **Build → Generate Signed Bundle / APK**.

### 3. Publish to GitHub Releases

1. Create a release on `Mr-Ninja1/ISO` (tag e.g. `v1.0.5`).
2. Attach **`iso-pro.apk`** (or rename asset consistently).
3. Copy the **direct HTTPS download** link to the `.apk` file.

Example pattern:

```text
https://github.com/Mr-Ninja1/ISO/releases/download/v1.0.5/iso-pro.apk
```

Or “latest” redirect (if you always upload the same asset name):

```text
https://github.com/Mr-Ninja1/ISO/releases/latest/download/iso-pro.apk
```

### 4. Update admin console (no website deploy required)

1. **Latest APK download URL** → paste the GitHub (or other HTTPS) link → **Save OTA settings**.
2. **Minimum native build** → set to the same number as `NEXT_PUBLIC_NATIVE_BUILD` for this APK (e.g. `5`).
3. Optional: **Broadcast** with audience **Installed app only** — short install instructions.

### 5. What users experience

- **Build 4** app, **min native build = 5** → fullscreen **Update required** → **Download APK** → install → reopen app (now build 5) → gate clears.
- **Build 5** app → normal use; OTA can still deliver web fixes.

---

## Releasing an OTA-only update (no new APK)

1. Deploy web/OTA (push `main` or `npm run release:ota`).
2. Ensure **Manifest URL** in admin points at `https://isopro.me/ota/production/manifest.json` (or your host).
3. Do **not** raise **Minimum native build** unless you also shipped a new APK.
4. Optional: native-only broadcast — “Close the app and reopen” / “Restart when prompted”.

OTA does **not** change `NEXT_PUBLIC_NATIVE_BUILD` on devices already installed.

---

## Build number checklist

| Step | Build number |
|------|----------------|
| Building APK #1 | `NEXT_PUBLIC_NATIVE_BUILD=1` |
| Building APK #2 (plugins fix) | `NEXT_PUBLIC_NATIVE_BUILD=2` |
| OTA deploy Tuesday | unchanged on devices |
| Building APK #3 (new permission) | `NEXT_PUBLIC_NATIVE_BUILD=3` |
| Force everyone off APK #1 and #2 | Admin **min native build = 3** + APK URL for #3 |

**Rule:** `min_native_build` in admin should be **≤** the build number of the APK you host at **Latest APK URL**. It is usually **equal** to the latest APK you want required.

---

## Native-only announcements

Developer console → **Broadcast** (or OTA panel broadcast):

| Audience | Who sees it |
|----------|-------------|
| **All users** | Website + installed app |
| **Installed app only** | Capacitor APK only (recommended for OTA/APK notices) |
| **Website only** | Browser only |

Website users never see **Installed app only** messages.

---

## Database migration

If not applied yet, run:

`supabase/migrations/20260520180000_native_audience_apk_url.sql`

Adds `global_announcements.audience` and `platform_settings.latest_apk_url`.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No update modal on old phones | Is **min native build** higher than their embedded build? Is the app Capacitor (not mobile browser)? |
| Download does nothing | **Latest APK URL** set and HTTPS? Try opening the URL in Chrome on the device. |
| Modal on website | Should not happen — gate is native-only. |
| OTA never runs | Device build &lt; min native build (OTA is skipped until APK updated). |
| Build number always 0 / gate never runs | APK built without `NEXT_PUBLIC_NATIVE_BUILD` — rebuild with env set. |

---

## Android mobile web install banner

On **Android phones in the browser** (not the installed app), a dismissible **Get the ISO Pro app** banner appears on:

- **Login**
- **Workspace**

It uses the same APK URL as the native update gate (**Latest APK download URL** in admin, then `NEXT_PUBLIC_ANDROID_APK_URL`). Users can dismiss it; preference is stored in `localStorage` (`iso-mobile-app-banner-dismissed:v1`).

The banner is **never** shown when `Capacitor.isNativePlatform()` is true.

---

## Related files

| File | Role |
|------|------|
| `src/components/NativeUpdateGate.tsx` | Block screen + Download APK |
| `src/app/api/platform/client-config/route.ts` | Public `minNativeBuild`, `latestApkUrl` |
| `src/components/admin/PlatformOtaPanel.tsx` | Admin UI for URL + min build |
| `tools/capacitor-build.mjs` | Embeds `NEXT_PUBLIC_NATIVE_BUILD` in bundle |
| `.github/workflows/android-apk-release.yml` | CI APK build + release artifact |
