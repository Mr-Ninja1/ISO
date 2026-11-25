"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";

type SoftNavLinkProps = {
  href: string;
  className?: string | ((active: boolean) => string);
  children: ReactNode;
  /** Match active when pathname starts with this path (default: href pathname). */
  activeMatch?: string;
  /** Force active styling (e.g. mutually exclusive tabs). */
  active?: boolean;
  /** Skip the global Loading chip — default true for tenant chrome. */
  silent?: boolean;
  onNavigate?: () => void;
};

function hrefPathname(href: string): string {
  try {
    return new URL(href, "https://local.invalid").pathname;
  } catch {
    return href.split("?")[0] || href;
  }
}

function pathMatches(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const matchPath = hrefPathname(href);
  return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
}

/**
 * Instant, cache-friendly navigation for tenant chrome.
 * Bypasses Next Link prefetch (which fights soft nav in the Capacitor WebView)
 * and uses silent router.push so online tabs feel as snappy as offline.
 */
export function SoftNavLink({
  href,
  className = "",
  children,
  activeMatch,
  active: activeProp,
  silent = true,
  onNavigate,
}: SoftNavLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pendingHrefRef = useRef<string | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const matchPath = activeMatch || hrefPathname(href);
  const pathActive =
    activeProp ??
    Boolean(pathname && (pathname === matchPath || pathname.startsWith(`${matchPath}/`)));

  const isPending = pendingHref === href && !pathMatches(pathname, href);
  const visuallyActive = pathActive || isPending;
  const resolvedClass =
    typeof className === "function" ? className(visuallyActive) : className;

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, []);

  const go = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (pendingHrefRef.current === href && !pathMatches(pathname, href)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      pendingHrefRef.current = href;
      setPendingHref(href);
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => {
        if (pendingHrefRef.current === href) {
          pendingHrefRef.current = null;
          setPendingHref(null);
        }
      }, 2500);
      onNavigate?.();
      navigateWithFeedback(router, href, "push", { silent });
    },
    [href, onNavigate, pathname, router, silent],
  );

  return (
    <a
      href={href}
      className={resolvedClass}
      data-active={visuallyActive ? "true" : undefined}
      data-pending={isPending ? "true" : undefined}
      onClick={go}
    >
      {children}
    </a>
  );
}
