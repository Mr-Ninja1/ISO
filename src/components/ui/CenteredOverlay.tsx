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
  /**
   * sheet = near full-screen on phones (AI engines, immersive flows).
   * dialog = compact centered card (default).
   */
  variant?: "dialog" | "sheet";
  /** Extra classes merged onto the panel (e.g. overflow-hidden for flex column children). */
  panelClassName?: string;
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
  variant = "dialog",
  panelClassName = "",
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

  const isSheet = variant === "sheet";

  return createPortal(
    <div
      className={
        `fixed inset-0 ${zIndexClass} flex items-end justify-center sm:items-center ` +
        (isSheet ? "p-0 sm:p-5" : "p-4 sm:p-6")
      }
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className={
          "absolute inset-0 backdrop-blur-[2px] " +
          (isSheet ? "bg-slate-900/50" : "bg-slate-900/40")
        }
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={
          `relative w-full border border-foreground/15 bg-background shadow-2xl ` +
          maxWidthClass +
          " " +
          (isSheet
            ? "flex max-h-[100dvh] flex-col overflow-hidden rounded-t-2xl sm:max-h-[min(92dvh,860px)] sm:rounded-2xl"
            : "max-h-[min(90vh,720px)] overflow-y-auto rounded-xl") +
          (panelClassName ? ` ${panelClassName}` : "")
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
