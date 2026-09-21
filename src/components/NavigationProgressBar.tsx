"use client";

import { NAVIGATION_START_EVENT } from "@/lib/client/navigationLoading";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS = 60;
const MAX_VISIBLE_MS = 8000;
const START_DELAY_MS = 180;

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
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(0);
  const holdTimerRef = useRef<number | null>(null);
  const hardTimeoutRef = useRef<number | null>(null);
  const startDelayTimerRef = useRef<number | null>(null);
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
    if (startDelayTimerRef.current) {
      window.clearTimeout(startDelayTimerRef.current);
      startDelayTimerRef.current = null;
    }
  }, []);

  const begin = useCallback(() => {
    if (activeRef.current) return;
    clearTimers();
    startDelayTimerRef.current = window.setTimeout(() => {
      activeRef.current = true;
      startRef.current = Date.now();
      setDone(false);
      setActive(true);
      hardTimeoutRef.current = window.setTimeout(() => {
        setDone(true);
        window.setTimeout(() => {
          activeRef.current = false;
          setActive(false);
        }, 160);
      }, MAX_VISIBLE_MS);
    }, START_DELAY_MS);
  }, [clearTimers]);

  const complete = useCallback(() => {
    clearTimers();
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
      }, 160);
    }, remaining);
  }, [clearTimers]);

  useEffect(() => {
    function onClick(ev: MouseEvent) {
      const anchor = isInternalNavigableAnchor(ev.target);
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      const current = `${window.location.pathname}${window.location.search}`;
      try {
        const next = new URL(href, window.location.href);
        if (current === `${next.pathname}${next.search}`) return;
      } catch {
        // Ignore malformed links; fall back to the standard loader flow.
      }
      // Avoid showing loader for same-url clicks.
      if (href === lastHrefRef.current) return;
      lastHrefRef.current = href;
      begin();
    }

    function onProgrammaticStart() {
      const current = `${window.location.pathname}${window.location.search}`;
      const projected = lastHrefRef.current
        ? (() => {
            try {
              const next = new URL(lastHrefRef.current, window.location.href);
              return `${next.pathname}${next.search}`;
            } catch {
              return lastHrefRef.current;
            }
          })()
        : "";
      if (projected && current === projected) return;
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
    // Path change means a real route navigation committed.
    // Ignore searchParams-only updates (e.g. workspace category tabs) so the
    // progress chip does not flash and hold the UI for in-page switches.
    lastHrefRef.current = pathname || "";
    complete();
  }, [pathname, complete]);

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
