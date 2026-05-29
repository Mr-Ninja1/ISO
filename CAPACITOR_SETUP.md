Capacitor Android Setup (recommended path)

This is the preferred native strategy for ISO Pro: ship the existing Next.js web app inside a Capacitor shell, keep the web app as the single source of truth, and rely on the browser engine plus the app's offline cache/local data for native-like behavior.

Why this is the best option
- The checklist/form builder already depends on browser rendering for fully custom shapes, signatures, and dynamic layouts.
- Rewriting that engine natively would create a second product with different behavior.
- Capacitor lets Android/iOS install the same web app, keep the same UI/logic, and still use local cache/data when offline.

1) Install Capacitor (run locally):

```bash
# from web/ directory
npm install @capacitor/core @capacitor/cli --save-exact
```

2) Initialize Capacitor (only once):

```bash
# set a proper package id (reverse domain) e.g. com.yourcompany.isopro
npx cap init "ISO Pro" com.yourcompany.isopro
```

Note: this updates `capacitor.config.json`. The repo already contains a placeholder `capacitor.config.json` you can edit.

3a) **Bundled offline (recommended for field APKs)** — ship the static web UI inside the APK

```bash
# from web/
# Optional: pre-generate route HTML for known tenant slugs (comma-separated)
$env:CAPACITOR_TENANT_SLUGS="your-brand-slug"
$env:NEXT_PUBLIC_API_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net"
npm run build:capacitor
npm run cap:open-android
```

- UI and JS load from the APK (`webDir: out`) so navigation works offline.
- API calls still go to `NEXT_PUBLIC_API_BASE_URL` when online.
- First login still needs internet once to authenticate and warm caches.

3b) Remote-wrapped approach — app loads your hosted site URL (dev / quick iteration)

Copy `capacitor.config.remote.json` over `capacitor.config.json`, then `npx cap copy android`. Navigation still needs network; use bundled mode for offline routing tests.

- Edit `capacitor.config.json` and add a `server` section with your site URL (must be HTTPS):

```json
{
  "appId": "com.yourcompany.isopro",
  "appName": "ISO Pro",
  "webDir": "public",
  "bundledWebRuntime": false,
  "server": {
    "url": "https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/"
  }
}
```

- Then add Android and open the project:

```bash
npx cap add android
npx cap open android
```

- In Android Studio: set signing keys and build an `APK` or `AAB` for release.

4) Android Studio: Build and test on device or emulator. Configure app signing for Play Store.

Key notes and tips
- Keep the web app as the single source of truth for forms, audits, and workspace behavior.
- Use the web app's PWA/service worker and local DB/cache to make first login hydrate the device and support offline use afterward.
- If using auth via cookies, test that the WebView sends correct cookies/headers; token-based auth (Bearer) usually works fine.
- For deeper native features (camera, storage), use Capacitor plugins; see https://capacitorjs.com/docs/plugins
- iOS requires macOS + Xcode and `npx cap add ios`.

Troubleshooting
- If you need the native wrapper to be fully offline, the frontend must be separated from the API routes so the UI can be exported locally.

If you want, I can scaffold a small `tools/capacitor` script to automate the native build flow and add helpers for generating Android icons/splash assets.
