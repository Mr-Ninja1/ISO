package com.isopro.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
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

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerInAppBackNavigation();
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
        if (tenantSegment.isEmpty() || tenantSegment.equals(SHELL_SLUG)) return null;

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
