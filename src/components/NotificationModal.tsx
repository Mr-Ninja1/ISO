"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type NotificationModalProps = {
  open: boolean;
  title: string;
  message: string;
  tone?: "default" | "success" | "warning" | "error";
  actionLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onAction?: () => void;
  onCancel?: () => void;
  actionTone?: "default" | "danger";
};

export function NotificationModal({
  open,
  title,
  message,
  tone = "default",
  actionLabel = "OK",
  cancelLabel = "Cancel",
  onClose,
  onAction,
  onCancel,
  actionTone = "default",
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

  if (typeof document === "undefined") return null;

  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-900"
        : tone === "error"
          ? "border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 text-red-900"
          : "border-slate-200 bg-gradient-to-br from-white to-slate-50/80 text-slate-900";
  const actionButtonClasses =
    actionTone === "danger"
      ? "h-10 rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-medium text-red-700 shadow-sm transition-all hover:bg-red-100 hover:shadow-md"
      : "h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md";
  const cancelButtonClasses = "h-10 rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-600 shadow-sm transition-all hover:bg-white hover:shadow-md";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
        aria-label="Close notification"
        onClick={onClose}
      />

      <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl backdrop-blur-xl ${toneClasses}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 opacity-90">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-current/20 bg-white/50 p-2 transition-all hover:bg-white hover:shadow-md"
            aria-label="Close"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {onAction ? (
            <button
              type="button"
              onClick={onCancel || onClose}
              className={cancelButtonClasses}
            >
              {cancelLabel}
            </button>
          ) : null}

          {onAction ? (
            <button
              type="button"
              onClick={onAction}
              className={actionButtonClasses}
            >
              {actionLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={actionButtonClasses}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
