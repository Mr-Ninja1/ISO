package com.isopro.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.print.IsoPdfPrintUtils;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.provider.MediaStore;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Generates a paginated PDF from an HTML file in app cache using Android's WebView
 * print pipeline. Avoids html2canvas OOM on long reports.
 */
@CapacitorPlugin(name = "ReportPdf")
public class ReportPdfPlugin extends Plugin {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void fromHtmlFile(PluginCall call) {
        String htmlPath = call.getString("htmlPath");
        if (htmlPath == null || htmlPath.trim().isEmpty()) {
            call.reject("htmlPath is required.");
            return;
        }

        String fileName = sanitizePdfName(call.getString("fileName", "report.pdf"));
        boolean landscape = "landscape".equalsIgnoreCase(call.getString("orientation", "portrait"));

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available.");
            return;
        }

        File htmlFile = resolveCacheFile(htmlPath.trim());
        if (htmlFile == null || !htmlFile.isFile()) {
            call.reject("HTML source file not found: " + htmlPath);
            return;
        }

        File outFile = new File(getContext().getCacheDir(), "ISO Grid/" + fileName);

        activity.runOnUiThread(() -> startPrintJob(call, htmlFile, outFile, landscape));
    }

    private void startPrintJob(PluginCall call, File htmlFile, File outFile, boolean landscape) {
        Context context = getContext();
        WebView webView = new WebView(context);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBlockNetworkImage(false);
        settings.setLoadsImagesAutomatically(true);
        // Needed so file:// documents with data-URI images still paint before print.
        settings.setDomStorageEnabled(true);
        // Prevent system dark mode from inverting print content into black pages.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(false);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        final boolean[] finished = { false };

        webView.setWebViewClient(
            new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (finished[0]) return;
                    // Brief settle so WebView finishes decoding inlined images.
                    mainHandler.postDelayed(
                        () -> {
                            if (finished[0]) return;
                            printWebView(call, view, outFile, landscape, () -> {
                                finished[0] = true;
                                destroyWebView(view);
                            });
                        },
                        250
                    );
                }

                @Override
                public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
                ) {
                    if (request != null && !request.isForMainFrame()) return;
                    if (finished[0]) return;
                    finished[0] = true;
                    CharSequence description =
                        error != null ? error.getDescription() : "unknown error";
                    call.reject("Failed to load HTML for PDF: " + description);
                    destroyWebView(view);
                }
            }
        );

        String fileUrl = htmlFile.toURI().toString();
        webView.loadUrl(fileUrl);
    }

    private void printWebView(
        PluginCall call,
        WebView webView,
        File outFile,
        boolean landscape,
        Runnable onDone
    ) {
        try {
            PrintAttributes.MediaSize mediaSize = PrintAttributes.MediaSize.ISO_A4;
            mediaSize = landscape ? mediaSize.asLandscape() : mediaSize.asPortrait();

            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(mediaSize)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();

            String jobName = outFile.getName();
            int dot = jobName.lastIndexOf('.');
            if (dot > 0) jobName = jobName.substring(0, dot);

            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);

            IsoPdfPrintUtils.writeToFile(
                getContext(),
                adapter,
                attributes,
                outFile,
                new IsoPdfPrintUtils.FileCallback() {
                    @Override
                    public void onSuccess(@NonNull File file) {
                        mainHandler.post(() -> {
                            try {
                                // Capacitor Share only accepts file:// URLs (not content://).
                                String fileUri = Uri.fromFile(file).toString();
                                String downloadsLabel = copyToPublicDownloads(file, file.getName());

                                JSObject result = new JSObject();
                                result.put("path", "ISO Grid/" + file.getName());
                                result.put("uri", fileUri);
                                if (downloadsLabel != null) {
                                    result.put("downloadsPath", downloadsLabel);
                                }
                                call.resolve(result);
                            } catch (Exception ex) {
                                call.reject("PDF created but URI resolve failed.");
                            } finally {
                                onDone.run();
                            }
                        });
                    }

                    @Override
                    public void onError(@NonNull String message) {
                        mainHandler.post(() -> {
                            call.reject(message);
                            onDone.run();
                        });
                    }
                }
            );
        } catch (Exception ex) {
            call.reject("PDF print failed: " + ex.getMessage());
            onDone.run();
        }
    }

    private void destroyWebView(@Nullable WebView webView) {
        if (webView == null) return;
        try {
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.destroy();
        } catch (Exception ignored) {}
    }

    /**
     * Copy into public Downloads/ISO Grid so the file appears in the system Files app.
     * Returns a human-readable label, or null if the copy failed.
     */
    @Nullable
    private String copyToPublicDownloads(File source, String fileName) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                values.put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/ISO Grid"
                );
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (item == null) return null;

                try (OutputStream out = resolver.openOutputStream(item);
                     FileInputStream in = new FileInputStream(source)) {
                    if (out == null) {
                        resolver.delete(item, null, null);
                        return null;
                    }
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                    }
                    out.flush();
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(item, values, null, null);
                return "Download/ISO Grid/" + fileName;
            }

            File downloads = Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS
            );
            File folder = new File(downloads, "ISO Grid");
            if (!folder.exists() && !folder.mkdirs()) return null;
            File target = new File(folder, fileName);
            try (FileInputStream in = new FileInputStream(source);
                 OutputStream out = new java.io.FileOutputStream(target)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                out.flush();
            }
            Intent scan = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
            scan.setData(Uri.fromFile(target));
            getContext().sendBroadcast(scan);
            return "Download/ISO Grid/" + fileName;
        } catch (Exception ex) {
            return null;
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("path is required.");
            return;
        }
        File file = resolveCacheFile(path.trim());
        if (file == null || !file.isFile()) {
            call.reject("PDF file not found: " + path);
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity available.");
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("application/pdf");
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(shareIntent, "Share PDF");
            activity.startActivity(chooser);
            JSObject result = new JSObject();
            result.put("completed", true);
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Could not open share sheet: " + ex.getMessage());
        }
    }

    @Nullable
    private File resolveCacheFile(String relativePath) {
        String cleaned = relativePath.replace('\\', '/');
        while (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        if (cleaned.contains("..")) return null;
        return new File(getContext().getCacheDir(), cleaned);
    }

    private static String sanitizePdfName(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) trimmed = "report.pdf";
        String sanitized = trimmed.replaceAll("[\\\\/:]", "_");
        if (!sanitized.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            sanitized = sanitized + ".pdf";
        }
        return sanitized;
    }
}
