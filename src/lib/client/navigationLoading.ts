export const NAVIGATION_START_EVENT = "iso:navigation-start";

type AppRouterLike = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

/** Fire before programmatic navigation so the global progress bar reacts instantly. */
export function signalNavigationStart() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAVIGATION_START_EVENT));
}

/** Navigate with immediate global loading feedback (top progress bar). */
export function navigateWithFeedback(
  router: Pick<AppRouterLike, "push" | "replace">,
  href: string,
  method: "push" | "replace" = "push",
) {
  signalNavigationStart();
  router[method](href);
}
