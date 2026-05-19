"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind max-width class, e.g. max-w-md */
  maxWidthClass?: string;
  /** z-index layer — defaults above tenant chrome */
  zIndexClass?: string;
};

/**
 * Full-viewport centered dialog rendered on document.body (avoids scroll/transform bugs in nested layouts).
 */
export function CenteredOverlay({
  open,
  onClose,
  children,
  maxWidthClass = "max-w-md",
  zIndexClass = "z-[100]",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 sm:p-6`}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidthClass} max-h-[min(90vh,720px)] overflow-y-auto rounded-xl border border-foreground/15 bg-background shadow-2xl`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
