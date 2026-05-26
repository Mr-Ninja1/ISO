# Testing native features on Android emulator

## Install / launch (Windows)

Emulator must be running (Android Studio → Device Manager).

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb install -r "c:\Users\Administrator\Desktop\ISO\web\android\app\build\outputs\apk\debug\app-debug.apk"
& $adb shell am start -n com.isogrid.app/.MainActivity
```

After code changes, rebuild the APK:

```powershell
cd web
$env:NEXT_PUBLIC_NATIVE_BUILD="2"
$env:NEXT_PUBLIC_API_BASE_URL="https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net"
npm run package:apk
# or faster for debug: npm run build:capacitor && npx cap sync android
# then Android Studio or: cd android; .\gradlew.bat assembleDebug
```

---

## Test: mandatory native update gate

The gate shows when **embedded build** &lt; **min native build** in Supabase `platform_settings`.

1. Note the build baked into your APK (`NEXT_PUBLIC_NATIVE_BUILD` at build time; default often `1`).
2. In **Admin → Native app & OTA**, set:
   - **Minimum native build** = `99` (or any number higher than the APK build)
   - **Latest APK download URL** = a working HTTPS APK link
3. Save. Open the app on the emulator **online**.
4. Expect a fullscreen **Update required** block with **Download APK**.

To clear the block: install an APK built with `NEXT_PUBLIC_NATIVE_BUILD=99` (or lower min in admin back to `1`).

---

## Test: native-only broadcast

1. Developer console → **Broadcast** → Audience **Installed app only**.
2. Send a test message.
3. On emulator app (signed in): modal should appear.
4. On desktop browser at `iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net`: same broadcast should **not** appear.

---

## Test: mobile web install banner (not native)

1. On emulator, open **Chrome** (not the ISO Pro app).
2. Go to your site login (e.g. `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/login` or local dev URL).
3. Use Chrome DevTools device mode or resize — banner shows on Android mobile UA.
4. Open the **installed ISO Pro app** → banner must **not** show.

Dismiss is stored in browser `localStorage` (`iso-mobile-app-banner-dismissed:v1`).

---

## Test: OTA restart prompt

Requires manifest URL configured and device build ≥ `minNativeBuild` in manifest. See [OTA_SETUP.md](./OTA_SETUP.md).
