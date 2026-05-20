import type { ReportEvidencePhoto } from "@/lib/reportEvidence";

const MARGIN_MM = 14;

function getPageSizeMm(orientation: "portrait" | "landscape") {
  return {
    width: orientation === "landscape" ? 297 : 210,
    height: orientation === "landscape" ? 210 : 297,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load evidence image"));
    img.src = src;
  });
}

/** Append full-page evidence attachment sheets after the main report PDF. */
export async function appendEvidencePagesToPdf(
  pdf: import("jspdf").jsPDF,
  photos: ReportEvidencePhoto[],
  orientation: "portrait" | "landscape"
) {
  if (!photos.length) return;

  const page = getPageSizeMm(orientation);
  const contentW = page.width - MARGIN_MM * 2;
  const headerBottom = MARGIN_MM + 22;
  const contentH = page.height - headerBottom - MARGIN_MM;

  for (let index = 0; index < photos.length; index += 1) {
    const item = photos[index];
    pdf.addPage("a4", orientation);

    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("Evidence attachments", MARGIN_MM, MARGIN_MM + 6);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    const caption = `${item.label} — ${index + 1} of ${photos.length}`;
    const captionLines = pdf.splitTextToSize(caption, contentW);
    pdf.text(captionLines, MARGIN_MM, MARGIN_MM + 14);

    try {
      const img = await loadImage(item.src);
      const ratio = Math.min(contentW / img.naturalWidth, contentH / img.naturalHeight);
      const drawW = img.naturalWidth * ratio;
      const drawH = img.naturalHeight * ratio;
      const x = MARGIN_MM + (contentW - drawW) / 2;
      const y = headerBottom + (contentH - drawH) / 2;

      const format = item.src.startsWith("data:image/jpeg") || item.src.startsWith("data:image/jpg")
        ? "JPEG"
        : "PNG";
      pdf.addImage(item.src, format, x, y, drawW, drawH);
    } catch {
      pdf.setFontSize(10);
      pdf.setTextColor(120, 120, 120);
      pdf.text("Image could not be embedded in this PDF export.", MARGIN_MM, headerBottom + 10);
    }
  }
}
