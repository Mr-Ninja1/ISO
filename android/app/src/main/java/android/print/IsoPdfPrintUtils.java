package android.print;

import android.content.Context;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import androidx.annotation.NonNull;
import java.io.File;

/**
 * Writes a {@link PrintDocumentAdapter} to a PDF file without showing the system print UI.
 * Lives in {@code android.print} so we can construct the package-private layout/write callbacks
 * (same approach used by Cordova/Capgo HTML→PDF plugins).
 */
public final class IsoPdfPrintUtils {

    private IsoPdfPrintUtils() {}

    public interface FileCallback {
        void onSuccess(@NonNull File file);

        void onError(@NonNull String message);
    }

    public static void writeToFile(
        Context context,
        PrintDocumentAdapter adapter,
        PrintAttributes attributes,
        File target,
        FileCallback callback
    ) {
        try {
            if (target.exists() && !target.delete()) {
                callback.onError("Failed to override existing PDF file.");
                return;
            }
            File parent = target.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                callback.onError("Failed to prepare output directory for PDF.");
                return;
            }

            ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(
                target,
                ParcelFileDescriptor.MODE_CREATE
                    | ParcelFileDescriptor.MODE_READ_WRITE
                    | ParcelFileDescriptor.MODE_TRUNCATE
            );
            CancellationSignal cancellationSignal = new CancellationSignal();
            PageRange[] allPages = new PageRange[] { PageRange.ALL_PAGES };

            adapter.onLayout(
                null,
                attributes,
                cancellationSignal,
                new PrintDocumentAdapter.LayoutResultCallback() {
                    @Override
                    public void onLayoutFailed(CharSequence error) {
                        closeQuietly(descriptor);
                        callback.onError("PDF layout failed: " + (error == null ? "" : error));
                    }

                    @Override
                    public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                        adapter.onWrite(
                            allPages,
                            descriptor,
                            cancellationSignal,
                            new PrintDocumentAdapter.WriteResultCallback() {
                                @Override
                                public void onWriteFinished(PageRange[] pages) {
                                    closeQuietly(descriptor);
                                    callback.onSuccess(target);
                                }

                                @Override
                                public void onWriteFailed(CharSequence error) {
                                    closeQuietly(descriptor);
                                    callback.onError(
                                        "PDF write failed: " + (error == null ? "" : error)
                                    );
                                }
                            }
                        );
                    }
                },
                null
            );
        } catch (Exception ex) {
            callback.onError("Failed to create PDF output.");
        }
    }

    private static void closeQuietly(ParcelFileDescriptor descriptor) {
        if (descriptor == null) return;
        try {
            descriptor.close();
        } catch (Exception ignored) {}
    }
}
