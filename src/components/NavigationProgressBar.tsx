"use client";

import { NAVIGATION_START_EVENT } from "@/lib/client/navigationLoading";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (hardTimeoutRef.current) {
      window.clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
    }
  }, []);

  const begin = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    startRef.current = Date.now();
    setDone(false);
    setActive(true);
    hardTimeoutRef.current = window.setTimeout(() => {
      setDone(true);
      window.setTimeout(() => {
        activeRef.current = false;
        setActive(false);
      }, 220);
    }, MAX_VISIBLE_MS);
  }, [clearTimers]);

  const complete = useCallback(() => {
    if (!activeRef.current) return;
    const elapsed = Date.now() - startRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      setDone(true);
      window.setTimeout(() => {
        activeRef.current = false;
        setActive(false);
        setDone(false);
      }, 220);
      clearTimers();
    }, remaining);
  }, [clearTimers]);

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

    function onProgrammaticStart() {
      begin();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener(NAVIGATION_START_EVENT, onProgrammaticStart);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAVIGATION_START_EVENT, onProgrammaticStart);
    };
  }, [begin]);

  useEffect(() => {
    // Route/search change means navigation has committed.
    complete();
  }, [pathname, searchParams?.toString(), complete]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers],
  );

  return (
    <>
      <div
        aria-hidden
        className={`route-progress ${active ? "route-progress--active" : ""} ${done ? "route-progress--done" : ""}`}
      />
      {active ? (
        <div className="route-pending-chip" role="status" aria-live="polite">
          <span className="route-pending-chip__dot" aria-hidden />
          Loading…
        </div>
      ) : null}
    </>
  );
}
