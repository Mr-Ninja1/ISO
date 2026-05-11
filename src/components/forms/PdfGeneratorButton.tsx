"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { generatePdfFromElement } from "@/lib/pdfGenerator";

type Props = {
  filename: string;
  orientation?: "portrait" | "landscape";
};

export function PdfGeneratorButton({ filename, orientation = "landscape" }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleGeneratePdf = async () => {
    if (generating) return;

    setGenerating(true);
    try {
      const element = document.getElementById("report-content");
      if (!element) {
        throw new Error("Report content not found");
      }

      await generatePdfFromElement(element, filename, { scale: 2, orientation });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGeneratePdf}
      disabled={generating}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm disabled:opacity-60 hover:bg-foreground/5"
      title="Download as PDF"
    >
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {generating ? "Generating..." : "Download PDF"}
    </button>
  );
}
