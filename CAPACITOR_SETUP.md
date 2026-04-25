Capacitor Android Setup (quick guide)

This file explains the minimal steps to create an Android app using Capacitor.

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

3a) Fast (remote-wrapped) approach — app loads your hosted site URL

- Edit `capacitor.config.json` and add a `server` section with your site URL (must be HTTPS):

```json
{
  "appId": "com.yourcompany.isopro",
  "appName": "ISO Pro",
  "webDir": "public",
  "bundledWebRuntime": false,
  "server": {
    "url": "https://app.yourdomain.com"
  }
}
```

- Then add Android and open the project:

```bash
npx cap add android
npx cap open android
```

- In Android Studio: set signing keys and build an `APK` or `AAB` for release.

3b) Bundled approach — include compiled web assets inside the native app

- Build your web app and copy into the native project:

```bash
npm run build
# ensure your build output (static assets) are in the folder referenced by `webDir` in capacitor.config.json
npx cap copy
npx cap open android
```

4) Android Studio: Build and test on device or emulator. Configure app signing for Play Store.

Key notes and tips
- Remote wrapping is fastest but requires your hosted site to be reliable and reachable.
- If using auth via cookies, test that the WebView sends correct cookies/headers; token-based auth (Bearer) usually works fine.
- For deeper native features (camera, storage), use Capacitor plugins; see https://capacitorjs.com/docs/plugins
- iOS requires macOS + Xcode and `npx cap add ios`.

Troubleshooting
- If your web app relies on server-side rendering or Next.js server functions, prefer remote-wrapped mode so the native app calls your live server.
- If you bundle static assets, confirm all critical routes are pre-rendered or handled client-side.

If you want, I can scaffold a small `tools/capacitor` script to automate `npm run build && npx cap copy android` and add additional helpers for generating Android icons/splash assets.
