"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Z_CARD_MENU, Z_CARD_MENU_BACKDROP } from "@/lib/ui/zIndex";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  menuWidthPx?: number;
  /** Close when the user scrolls (keeps card menus under the sticky header). */
  closeOnScroll?: boolean;
};

export function FloatingActionMenu({
  open,
  onClose,
  anchorRef,
  children,
  menuWidthPx = 224,
  closeOnScroll = true,
}: Props) {
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
    function onScroll() {
      if (closeOnScroll) {
        onClose();
        return;
      }
      update();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, menuWidthPx, closeOnScroll, onClose]);

  if (!open || !position) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        style={{ zIndex: Z_CARD_MENU_BACKDROP }}
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed rounded-2xl border border-foreground/15 bg-background p-2 shadow-xl"
        style={{ top: position.top, left: position.left, width: menuWidthPx, zIndex: Z_CARD_MENU }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
