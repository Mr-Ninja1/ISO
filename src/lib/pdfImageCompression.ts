/** Max pixel width/height for images embedded in PDF exports (screen/print quality). */
export const PDF_EVIDENCE_MAX_PX = 1280;

/** JPEG quality for rasterized report pages and recompressed evidence photos. */
export const PDF_JPEG_QUALITY = 0.68;

export function canvasToJpegDataUrl(
  canvas: HTMLCanvasElement,
  quality = PDF_JPEG_QUALITY,
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Prefer same-origin / data URLs so Capacitor WebView CORS cannot taint the canvas. */
async function resolveImageSrcForCanvas(src: string): Promise<string> {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }
  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Image fetch failed (${response.status})`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return src;
  }
}

/** Downscale and recompress an image for PDF embedding. */
export async function compressImageForPdf(
  src: string,
  maxPx = PDF_EVIDENCE_MAX_PX,
  quality = PDF_JPEG_QUALITY,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  let objectUrl: string | null = null;
  try {
    const resolved = await resolveImageSrcForCanvas(src);
    if (resolved.startsWith("blob:") && resolved !== src) {
      objectUrl = resolved;
    }
    const img = await loadImage(resolved);
    const scale = Math.min(
      1,
      maxPx / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error(
        "Failed to get 2D context for image compression canvas. Image src:",
        src,
      );
      return null;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return {
      dataUrl: canvasToJpegDataUrl(canvas, quality),
      width,
      height,
    };
  } catch (error) {
    console.warn("[pdf] Evidence image compression failed:", src, error);
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load image for PDF compression"));
    img.src = src;
  });
}
