"use client";

import { useEffect, useState } from "react";
import { TabletSmartphone, X } from "lucide-react";

const DISMISSED_KEY = "iso-small-screen-modal-dismissed";
const SMALL_SCREEN_QUERY = "(max-width: 767px)";

export function SmallScreenModal() {
  const [mounted, setMounted] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);

    try {
      setDismissed(window.sessionStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    const mediaQuery = window.matchMedia(SMALL_SCREEN_QUERY);

    const updateMatch = () => setIsSmallScreen(mediaQuery.matches);
    updateMatch();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatch);
      return () => mediaQuery.removeEventListener("change", updateMatch);
    }

    mediaQuery.addListener(updateMatch);
    return () => mediaQuery.removeListener(updateMatch);
  }, []);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
    setDismissed(true);
  }

  if (!mounted || !isSmallScreen || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        aria-label="Dismiss smaller screen notice"
        onClick={dismiss}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="small-screen-modal-title"
        className="relative w-full max-w-md rounded-3xl border border-foreground/10 bg-background p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/[0.04] text-foreground/80">
              <TabletSmartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 id="small-screen-modal-title" className="text-lg font-semibold tracking-tight">
                Bigger screen recommended
              </h2>
              <p className="mt-1 text-sm leading-6 text-foreground/70">
                For the best experience, please use a tablet or PC. Some workflows are easier to manage on a larger display.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-foreground/10 p-2 text-foreground/70 transition hover:bg-foreground/5 hover:text-foreground"
            aria-label="Close notice"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 text-sm leading-6 text-foreground/70">
          Use a tablet or a PC to get a clearer layout, easier navigation, and more comfortable form entry.
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:translate-y-[-1px]"
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}