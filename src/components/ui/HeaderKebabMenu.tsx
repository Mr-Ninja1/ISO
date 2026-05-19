"use client";

import { MoreVertical } from "lucide-react";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

const MenuCloseContext = createContext<(() => void) | null>(null);

type Props = {
  label?: string;
  triggerClassName?: string;
  menuClassName?: string;
  children: ReactNode;
  onClose?: () => void;
};

export function HeaderKebabMenu({
  label = "Menu",
  triggerClassName = "",
  menuClassName = "w-52",
  children,
  onClose,
}: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const openMenu = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    function onScroll() {
      close();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open, close]);

  const menu =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <MenuCloseContext.Provider value={close}>
            <button
              type="button"
              className="fixed inset-0 z-[250] cursor-default bg-black/20"
              aria-label="Close menu"
              onClick={close}
            />
            <div
              id={menuId}
              role="menu"
              className={
                "ui-menu fixed z-[251] max-h-[min(70vh,420px)] overflow-y-auto p-1 " + menuClassName
              }
              style={{ top: coords.top, right: coords.right }}
            >
              {children}
            </div>
          </MenuCloseContext.Provider>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-foreground/80 shadow-sm transition-colors hover:border-border-strong hover:bg-surface-muted " +
          triggerClassName
        }
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openMenu())}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu}
    </>
  );
}

export function HeaderMenuItem({
  children,
  className = "",
  onClick,
  href,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  href?: string;
  disabled?: boolean;
}) {
  const closeMenu = useContext(MenuCloseContext);
  const base =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-foreground/8 disabled:opacity-50";

  const handleClick = (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented) closeMenu?.();
  };

  if (href) {
    return (
      <a href={href} className={base + " " + className} onClick={handleClick}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" role="menuitem" disabled={disabled} className={base + " " + className} onClick={handleClick}>
      {children}
    </button>
  );
}
