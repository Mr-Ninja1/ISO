"use client";

import { useEffect, useState } from "react";
import { generatePdfBlobFromElement } from "@/lib/pdfGenerator";

type Props = {
  title: string;
  /** Full URL to this report (preferred). */
  url: string;
  /** Optional: enable PDF sharing */
  enablePdfShare?: boolean;
};

function buildShareBody(url: string, title: string) {
  return `ISO Audit Report: ${title}\n${url}`;
}

function openWhatsApp(url: string, title: string) {
  const text = encodeURIComponent(buildShareBody(url, title));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

export async function shareAuditLink(url: string, title: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: `ISO Audit - ${title}`,
        text: buildShareBody(url, title),
        url,
      });
      return;
    } catch {
      // user cancelled or share failed
    }
  }
  openWhatsApp(url, title);
}

export async function shareAuditPdf(title: string) {
  const element = document.getElementById("report-content");
  if (!element) {
    throw new Error("Report content not found");
  }

  const pdfBlob = await generatePdfBlobFromElement(element, { scale: 2, orientation: "portrait" });
  const file = new File([pdfBlob], `${title.replace(/[^a-z0-9]/gi, '-')}.pdf`, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `ISO Audit - ${title}`,
        files: [file],
      });
      return;
    } catch {
      // user cancelled or share failed, fallback to download
    }
  }

  // Fallback: download the file
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-z0-9]/gi, '-')}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AuditShareControls({ title, url, enablePdfShare = false }: Props) {
  const [sharingPdf, setSharingPdf] = useState(false);

  const handleShareLink = () => {
    void shareAuditLink(url, title);
  };

  const handleSharePdf = async () => {
    if (sharingPdf) return;
    setSharingPdf(true);
    try {
      await shareAuditPdf(title);
    } catch (error) {
      console.error("Failed to share PDF:", error);
      alert("Failed to share PDF. Please try again.");
    } finally {
      setSharingPdf(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="print-hide h-9 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
        onClick={handleShareLink}
      >
        Share Link
      </button>
      {enablePdfShare && (
        <button
          type="button"
          className="print-hide h-9 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5 disabled:opacity-60"
          onClick={handleSharePdf}
          disabled={sharingPdf}
        >
          {sharingPdf ? "Generating..." : "Share PDF"}
        </button>
      )}
    </div>
  );
}

/** Resolves absolute report URL on the client for server-rendered report pages. */
export function AuditReportShareControls({
  tenantSlug,
  auditId,
  title,
  enablePdfShare = false,
}: {
  tenantSlug: string;
  auditId: string;
  title: string;
  enablePdfShare?: boolean;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/${tenantSlug}/audits/${auditId}`);
  }, [tenantSlug, auditId]);

  if (!url) return null;

  return <AuditShareControls title={title} url={url} enablePdfShare={enablePdfShare} />;
}
