"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, ShieldCheck, Smartphone, X } from "lucide-react";

type Props = {
  open: boolean;
  apkUrl: string;
  onClose: () => void;
};

export function AndroidApkInstallDialog({ open, apkUrl, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !apkUrl || typeof document === "undefined") return null;

  function continueDownload() {
    window.open(apkUrl, "_blank", "noopener,noreferrer");
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apk-install-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[var(--hse-charcoal)]/55 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--hse-teal)_20%,transparent)] bg-[var(--hse-cream)] shadow-2xl">
        <div className="border-b border-[color-mix(in_srgb,var(--hse-teal)_12%,transparent)] bg-[color-mix(in_srgb,var(--hse-sky)_50%,white)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--hse-teal)] text-white">
              <Smartphone className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--hse-teal-mid)]">
                Official ISO Pro app
              </p>
              <h2 id="apk-install-dialog-title" className="text-lg font-semibold text-[var(--hse-charcoal)]">
                Install on Android
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-[var(--hse-teal-mid)] hover:bg-white/80"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm leading-6 text-[var(--accent-soft)]">
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-emerald-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <p>
              <strong className="text-emerald-950">ISO Pro is safe.</strong> This is the official HSE workspace app
              from your organisation — not a random file from the internet. We distribute the APK directly so your
              team can work offline in the field.
            </p>
          </div>

          <p className="text-[var(--hse-charcoal)]">
            Android may show <strong>“unknown developer”</strong> or <strong>Play Protect”</strong> because the app is
            not installed from the Google Play Store. That warning is normal for official business apps distributed
            by your admin.
          </p>

          <ol className="list-decimal space-y-2 pl-5 text-[var(--hse-charcoal)]">
            <li>Tap <strong>Continue download</strong> below.</li>
            <li>When the download finishes, open the <strong>iso-pro.apk</strong> file.</li>
            <li>If asked, allow install from <strong>Chrome</strong> or <strong>Files</strong> (Install unknown apps).</li>
            <li>If Play Protect appears, tap <strong>More details</strong> → <strong>Install anyway</strong>.</li>
            <li>Open ISO Pro and sign in with your usual account.</li>
          </ol>
        </div>

        <div className="flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--hse-teal)_10%,transparent)] px-5 py-4 sm:flex-row-reverse">
          <button
            type="button"
            onClick={continueDownload}
            className="ws-btn-primary inline-flex h-11 flex-1 items-center justify-center gap-2 px-4 text-sm"
          >
            <Download className="h-4 w-4" aria-hidden />
            Continue download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[var(--hse-teal)] bg-white px-4 text-sm font-semibold text-[var(--hse-teal)]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
