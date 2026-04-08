"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export type NotificationModalProps = {
  open: boolean;
  title: string;
  message: string;
  tone?: "default" | "success" | "warning" | "error";
  actionLabel?: string;
  onClose: () => void;
  onAction?: () => void;
};

export function NotificationModal({
  open,
  title,
  message,
  tone = "default",
  actionLabel = "OK",
  onClose,
  onAction,
}: NotificationModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toneClasses =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-foreground/20 bg-background text-foreground";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close notification"
        onClick={onClose}
      />

      <div className={`relative w-full max-w-md rounded-lg border p-5 shadow-xl ${toneClasses}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 opacity-90">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-current/20 p-2"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="h-10 rounded-md border border-current/20 px-4 text-sm font-medium hover:bg-black/5"
            >
              {actionLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-current/20 px-4 text-sm font-medium hover:bg-black/5"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
