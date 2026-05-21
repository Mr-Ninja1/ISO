"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  menuWidthPx?: number;
};

export function FloatingActionMenu({ open, onClose, anchorRef, children, menuWidthPx = 224 }: Props) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, rect.right - menuWidthPx),
        window.innerWidth - menuWidthPx - 8
      );
      setPosition({ top: rect.bottom + 6, left });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, menuWidthPx]);

  if (!open || !position) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[99980] cursor-default"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed z-[99990] rounded-2xl border border-foreground/15 bg-background p-2 shadow-xl"
        style={{ top: position.top, left: position.left, width: menuWidthPx }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
