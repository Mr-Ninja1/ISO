"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS = 240;
const MAX_VISIBLE_MS = 12000;

function isInternalNavigableAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return null;
  const href = anchor.getAttribute("href") || "";
  if (!href) return null;
  if (href.startsWith("#")) return null;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  return anchor;
}

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(0);
  const holdTimerRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
  const lastHrefRef = useRef<string>("");

  const clearTimers = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      window.clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  };

  const begin = () => {
    if (active) return;
    clearTimers();
    startRef.current = Date.now();
    setDone(false);
    setActive(true);
    hardTimeoutRef.current = window.setTimeout(() => {
      setDone(true);
      window.setTimeout(() => setActive(false), 220);
    }, MAX_VISIBLE_MS);
  };

  const complete = () => {
    if (!active) return;
    const elapsed = Date.now() - startRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      setDone(true);
      window.setTimeout(() => {
        setActive(false);
        setDone(false);
      }, 220);
      clearTimers();
    }, remaining);
  };

  useEffect(() => {
    function onClick(ev: MouseEvent) {
      const anchor = isInternalNavigableAnchor(ev.target);
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      // Avoid showing loader for same-url clicks.
      if (href === lastHrefRef.current) return;
      lastHrefRef.current = href;
      begin();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  useEffect(() => {
    // Route/search change means navigation has committed.
    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );

  return (
    <div
      aria-hidden
      className={`route-progress ${active ? "route-progress--active" : ""} ${done ? "route-progress--done" : ""}`}
    />
  );
}

