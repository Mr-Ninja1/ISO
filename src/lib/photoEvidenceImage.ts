const PHOTO_EVIDENCE_MAX_EDGE_PX = 1600;
const PHOTO_EVIDENCE_JPEG_QUALITY = 0.78;

/** Resize captured evidence before it enters form state or local draft storage. */
export async function compressPhotoEvidence(file: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be opened."));
      element.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("This image has no readable dimensions.");
    }

    const scale = Math.min(1, PHOTO_EVIDENCE_MAX_EDGE_PX / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("This image could not be compressed."))),
        "image/jpeg",
        PHOTO_EVIDENCE_JPEG_QUALITY,
      );
    });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("This image could not be prepared for saving."));
      };
      reader.onerror = () => reject(new Error("This image could not be prepared for saving."));
      reader.readAsDataURL(compressed);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
