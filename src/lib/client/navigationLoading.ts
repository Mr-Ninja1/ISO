import { markInteractiveNav } from "@/lib/client/interactionGate";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";

export const NAVIGATION_START_EVENT = "iso:navigation-start";

type AppRouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Fire before programmatic navigation so the global progress bar reacts instantly. */
function normalizeHrefPathWithSearch(href: string): string | null {
  try {
    const next = new URL(href, window.location.href);
    return `${next.pathname}${next.search}`;
  } catch {
    return null;
  }
}

export function signalNavigationStart(href?: string) {
  if (typeof window === "undefined") return;

  const current = `${window.location.pathname}${window.location.search}`;
  const target = href ? normalizeHrefPathWithSearch(href) : null;

  if (target && current === target) return;

  window.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT));
}

type NavigateWithFeedbackOptions = {
  /**
   * Skip the global "Loading…" chip. Use for cache-backed opens (forms, workspace
   * home, prepared category switches) where soft nav should feel instant.
   */
  silent?: boolean;
  /** How long to pause background sync while the route paints (ms). */
  busyMs?: number;
};

function runRouterNav(
  router: Pick<AppRouterLike, "push" | "replace">,
  href: string,
  method: "push" | "replace",
) {
  const go = () => router[method](href);
  // Capturing and animating the full page can stutter inside a WebView, especially
  // when leaving a large form. Let Capacitor's router commit directly.
  if (isCapacitorNativeApp()) {
    go();
    return;
  }
  // View Transitions give a native cross-fade when the browser supports them.
  const doc = typeof document !== "undefined" ? document : null;
  if (doc && "startViewTransition" in doc) {
    try {
      (doc as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(go);
      return;
    } catch {
      // Fall through to plain navigation.
    }
  }
  go();
}

/** Navigate with immediate global loading feedback (top progress bar). */
export function navigateWithFeedback(
  router: Pick<AppRouterLike, "push" | "replace">,
  href: string,
  method: "push" | "replace" = "push",
  options?: NavigateWithFeedbackOptions,
) {
  const current = `${window.location.pathname}${window.location.search}`;
  const target = normalizeHrefPathWithSearch(href);

  if (target && current === target) {
    router[method](href);
    return;
  }

  // Pause background sync/warmup so leave/open paint stays native-fast.
  markInteractiveNav(options?.busyMs ?? 3200);
  if (!options?.silent) {
    signalNavigationStart(href);
  }
  runRouterNav(router, href, method);
}
