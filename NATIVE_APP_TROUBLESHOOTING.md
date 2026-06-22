# Native app troubleshooting (Capacitor / Android)

Quick reference when the **website works** but the **Android app** misbehaves. For update mechanics (APK vs OTA), see [NATIVE_APP_UPDATE_GUIDE.md](./NATIVE_APP_UPDATE_GUIDE.md).

---

## Symptom → cause → where to look

| Symptom | Likely cause | First files to open |
|--------|----------------|---------------------|
| **"Sign in failed" instantly** (no loading) | `CapacitorHttp` breaks POST JSON; or login still hits `/api/auth/sign-in` | `capacitor.config.json` (`CapacitorHttp: false`), `src/lib/auth/nativeSignIn.ts`, `src/lib/client/nativeFetch.ts` |
| **"This page could not load"** on first open (before login) | Cold-start `hardNavigate` races WebView; missing trailing slash on static routes; stale OTA bundle | `src/components/CapacitorEntryRedirect.tsx`, `src/lib/client/appEntryNavigation.ts` (`toCapacitorDocumentHref`), `src/lib/capacitor/liveUpdateReady.ts`, `android/.../MainActivity.java` (`resetOtaIfApkUpgraded`) |
| **Stuck on "Starting ISO Grid"** after login | Post-auth routing / session hydration | `src/lib/client/postLoginRouting.ts`, `src/components/AuthProvider.tsx`, `src/app/page.tsx` |
| **Only forms work; dashboard / settings / AI dead** | API calls go to `https://localhost/api/...` instead of Azure | `src/lib/client/apiBase.ts` — must **not** treat Capacitor origin as dev host |
| **"Open forms workspace" or header nav crashes** | `hardNavigate` to `/workspace/forms` (no static page) | `src/lib/capacitor/routeRewrite.ts`, `src/lib/client/workspaceNavigation.ts`, use `/workspace?view=forms` |
| **Back / home button crashes** | Full page reload to reserved path | `src/components/PageWayfinder.tsx` (use `router.push`), `MainActivity.java` `RESERVED_SEGMENTS` |
| **OTA applied but app broken / blank** | Bad manifest URL (`YOUR-HOST`), or OTA zip mismatches APK chunks | `public/ota/production/manifest.json`, `tools/package-ota-bundle.mjs`, bump `versionCode` + reinstall to clear OTA |
| **Copilot empty / "Here's what I found."** | `/api/copilot/chat` failed (often same `apiBase` bug) | `src/lib/client/apiBase.ts`, Azure env (`GEMINI_*` on server, not in APK) |

---

## Architecture reminder (why website ≠ app)

```text
Website build          Capacitor build (APK / OTA)
─────────────────      ───────────────────────────
next build (server)    CAPACITOR_BUILD=1 → static out/
API routes on Azure    No /api/* in APK — fetch must hit Azure URL
Normal browser fetch   WebView + optional Live Update overlay
```

Same repo, two outputs. Website-only features (new API routes, SSR assumptions) can break the app until you add a **native fallback** (usually direct Supabase) or ship a new APK.

---

## Issue log (June 2026 — v1.4.1 / build 9)

### 1. Instant sign-in failure

- **Cause:** `CapacitorHttp: true` mangled JSON POST bodies.
- **Fix:** Disable in `capacitor.config.json`; native sign-in via Supabase client; `nativeFetch` for other API calls.

### 2. API calls to localhost on device

- **Cause:** `apiBase.ts` returned `https://localhost` when `isLocalDevHost(hostname)` ran before the Capacitor check.
- **Fix:** Only use localhost origin when `!isCapacitorNativeApp()`.

### 3. First-visit "This page could not load"

- **Cause:** `CapacitorEntryRedirect` called `hardNavigate('/login')` on mount before React hydrated; `/login` without trailing slash failed static export (`trailingSlash: true`).
- **Fix:** No cold-start hard redirect; trailing-slash normalization in `hardNavigate`; defer OTA checks in `LiveUpdateBootstrap.tsx`; bump `versionCode` to clear stale OTA.

### 4. Navigation crashes (forms, back, home)

- **Cause:** `hardNavigate` to paths that are not separate static HTML files; missing `MainActivity` reserved segments.
- **Fix:** `rewriteCapacitorHref`, workspace query routes (`?view=forms`), `router.push` for in-app nav.

---

## Fix checklist (use in order)

1. **Reproduce on emulator** — see [TESTING_NATIVE_EMULATOR.md](./TESTING_NATIVE_EMULATOR.md).
2. **Check API base** — in WebView devtools / logging, confirm requests go to Azure, not `https://localhost`.
3. **Check OTA** — `platform_settings.live_update_bundle_url` must be a real HTTPS manifest; `bundleUrl` in manifest must not contain `YOUR-HOST`.
4. **Clear bad OTA** — Settings → Apps → ISO Grid → Clear storage, or install APK with higher `versionCode` (triggers `resetOtaIfApkUpgraded` / `liveUpdateReady` reset).
5. **Rebuild golden baseline** — `npm run release:golden` (APK + matching OTA).
6. **Ship web-only fix** — `npm run release:ota` (no new APK if no native changes).
7. **Update Supabase** — `min_native_build`, `latest_apk_url`, `live_update_bundle_url`.

---

## Key commands

```bash
cd web

# Full golden APK + OTA (native shell change)
npm run release:golden

# Web-only OTA (after golden APK is installed)
npm run release:ota

# Point admin "Download APK" at GitHub
node tools/update-platform-apk-url.mjs \
  "https://github.com/Mr-Ninja1/ISO/releases/download/v1.4.1/iso-grid.apk" \
  9
```

---

## Golden baseline (current)

| Field | Value |
|-------|--------|
| APK version | **1.4.1** (`versionName`) |
| Native build | **9** (`versionCode` / `NEXT_PUBLIC_NATIVE_BUILD`) |
| GitHub release | [v1.4.1](https://github.com/Mr-Ninja1/ISO/releases/tag/v1.4.1) |
| OTA bundle | `golden.9.*` in `public/ota/production/` |

After v1.4.1, prefer **OTA** for UI/JS fixes; ship a **new APK** only for Capacitor plugins, Android permissions, or WebView shell changes.
