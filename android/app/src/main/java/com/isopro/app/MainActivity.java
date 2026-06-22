package com.isopro.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.InputStream;

/**
 * Serves exported tenant routes from the placeholder slug folder so any brand slug works offline.
 * Build exports pages under /_/…; this remaps /{tenant}/… → /_/… for bundled assets.
 */
public class MainActivity extends BridgeActivity {

    private static final String SHELL_SLUG = "_";
    private static final java.util.Set<String> RESERVED_SEGMENTS = java.util.Set.of(
        "workspace",
        "login",
        "signup",
        "developer-login",
        "onboarding",
        "offline",
        "admin",
        "dashboard",
        "api",
        "shared",
        "_"
    );
    private static final String APK_GUARD_PREFS = "iso_apk_bundle_guard";
    private static final String GUARD_VERSION_KEY = "lastVersionCode";
    private static final String GUARD_WEB_BUNDLE_KEY = "webBundleId";
    private static final String CAP_WEBVIEW_PREFS = "CapWebViewSettings";
    private static final String CAP_SERVER_PATH = "serverBasePath";
    private static final String LIVE_UPDATE_PREFS = "CapawesomeLiveUpdate";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    resetOtaIfApkUpgraded();
    super.onCreate(savedInstanceState);
    ensureNotificationChannel();
    registerInAppBackNavigation();
  }

  /**
   * After a new APK install, clear any OTA web bundle overlay so the WebView loads
   * the HTML/JS shipped inside this build (stale OTA + new APK = blank/broken app).
   */
  private void resetOtaIfApkUpgraded() {
    try {
      PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
      int current = info.versionCode;
      SharedPreferences guard = getSharedPreferences(APK_GUARD_PREFS, MODE_PRIVATE);
      int last = guard.getInt(GUARD_VERSION_KEY, -1);
      String bundledWebId = readAssetText("public/web-bundle-id.txt");
      String lastWebId = guard.getString(GUARD_WEB_BUNDLE_KEY, "");

      boolean versionChanged = last != -1 && last != current;
      boolean webBundleChanged =
        bundledWebId != null
          && !bundledWebId.isEmpty()
          && !lastWebId.isEmpty()
          && !bundledWebId.equals(lastWebId);

      if (versionChanged || webBundleChanged) {
        clearOtaWebOverlay();
      }

      guard.edit().putInt(GUARD_VERSION_KEY, current).apply();
      if (bundledWebId != null && !bundledWebId.isEmpty()) {
        guard.edit().putString(GUARD_WEB_BUNDLE_KEY, bundledWebId).apply();
      }
    } catch (PackageManager.NameNotFoundException ignored) {
      // keep default bundled assets
    }
  }

  private void clearOtaWebOverlay() {
    getSharedPreferences(CAP_WEBVIEW_PREFS, MODE_PRIVATE)
      .edit()
      .remove(CAP_SERVER_PATH)
      .apply();

    getSharedPreferences(LIVE_UPDATE_PREFS, MODE_PRIVATE)
      .edit()
      .remove("previousBundleId")
      .apply();
  }

  private String readAssetText(String assetPath) {
    try (InputStream in = getAssets().open(assetPath)) {
      byte[] buffer = new byte[Math.max(in.available(), 0)];
      int read = in.read(buffer);
      if (read <= 0) return "";
      return new String(buffer, 0, read, "UTF-8").trim();
    } catch (Exception ignored) {
      return null;
    }
  }

  private void ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
      "iso-general",
      "ISO Grid alerts",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Announcements, reminders, and system alerts");

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.createNotificationChannel(channel);
    }
  }

  /**
   * Never finish the activity on back — delegate to the WebView / in-app navigation script first.
   */
  private void registerInAppBackNavigation() {
    getOnBackPressedDispatcher()
      .addCallback(
        this,
        new OnBackPressedCallback(true) {
          @Override
          public void handleOnBackPressed() {
            Bridge bridge = getBridge();
            if (bridge == null) {
              moveTaskToBack(true);
              return;
            }

            WebView webView = bridge.getWebView();
            if (webView == null) {
              moveTaskToBack(true);
              return;
            }

            webView.evaluateJavascript(
              "(function(){try{if(window.__ISO_HANDLE_BACK__){return window.__ISO_HANDLE_BACK__()===true;} }catch(e){} return false;})()",
              value -> {
                if ("true".equals(String.valueOf(value))) {
                  return;
                }

                runOnUiThread(() -> {
                  if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                  }
                  moveTaskToBack(true);
                });
              }
            );
          }
        }
      );
  }

    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() == null || getBridge().getWebView() == null) return;

        final WebView webView = getBridge().getWebView();
        final BridgeWebViewClient baseClient = new BridgeWebViewClient(getBridge());

        webView.setWebViewClient(
            new BridgeWebViewClient(getBridge()) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    WebResourceResponse remapped = remapTenantShellAsset(view, request.getUrl());
                    if (remapped != null) return remapped;
                    return baseClient.shouldInterceptRequest(view, request);
                }
            });
    }

    private WebResourceResponse remapTenantShellAsset(WebView view, Uri uri) {
        if (uri == null) return null;

        String path = uri.getPath();
        if (path == null || path.isEmpty()) return null;
        if (path.startsWith("/_next/") || path.startsWith("/api/")) return null;
        if (path.startsWith("/" + SHELL_SLUG + "/") || path.equals("/" + SHELL_SLUG)) return null;

        String[] segments = path.split("/");
        if (segments.length < 3) return null;

        String tenantSegment = segments[1];
        if (tenantSegment.isEmpty() || tenantSegment.equals(SHELL_SLUG) || RESERVED_SEGMENTS.contains(tenantSegment)) {
            return null;
        }

        String remappedPath = "/" + SHELL_SLUG + path.substring(tenantSegment.length() + 1);
        String assetPath = resolveShellAssetPath(view, remappedPath);

        try {
            InputStream stream = view.getContext().getAssets().open(assetPath);
            String mime = assetPath.endsWith(".html") ? "text/html" : "application/octet-stream";
            return new WebResourceResponse(mime, "UTF-8", stream);
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Static export only includes placeholder dynamic segments (e.g. /_/audits/_).
     * Map any real audit id to the shell HTML so View report does not blank-screen.
     */
    private String resolveShellAssetPath(WebView view, String remappedPath) {
        String assetPath = "public" + remappedPath;
        if (assetPath.endsWith("/")) {
            assetPath += "index.html";
        } else if (!assetPath.endsWith(".html") && !assetPath.contains(".")) {
            assetPath += "/index.html";
        }

        if (assetPath.contains("/audits/")) {
            String[] parts = remappedPath.split("/");
            // /_/audits/{segment}
            if (parts.length >= 4) {
                String auditSegment = parts[3];
                if (!auditSegment.isEmpty()
                        && !auditSegment.equals("_")
                        && !auditSegment.equals("new")
                        && !auditSegment.equals("local")
                        && !auditSegment.equals("offline-last")) {
                    String shellAudit = "public/" + SHELL_SLUG + "/audits/_/index.html";
                    try {
                        view.getContext().getAssets().open(shellAudit);
                        return shellAudit;
                    } catch (Exception ignored) {
                        // fall through
                    }
                }
            }
        }

        return assetPath;
    }
}
