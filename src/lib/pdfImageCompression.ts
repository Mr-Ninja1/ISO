/** Max pixel width/height for images embedded in PDF exports (screen/print quality). */
export const PDF_EVIDENCE_MAX_PX = 1600;

/** JPEG quality for rasterized report pages and recompressed evidence photos. */
export const PDF_JPEG_QUALITY = 0.82;

export function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = PDF_JPEG_QUALITY): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Downscale and recompress an image for PDF embedding. */
export async function compressImageForPdf(
  src: string,
  maxPx = PDF_EVIDENCE_MAX_PX,
  quality = PDF_JPEG_QUALITY
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to prepare image compression canvas");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return {
    dataUrl: canvasToJpegDataUrl(canvas, quality),
    width,
    height,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for PDF compression"));
    img.src = src;
  });
}
