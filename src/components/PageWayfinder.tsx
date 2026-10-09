"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Home } from "lucide-react";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";
import { resolvePageWayfinder } from "@/lib/client/resolvePageWayfinder";

type Props = {
  tenantSlug: string;
  /** compact = icon-only chips for header embedding */
  variant?: "compact" | "labeled";
};

/**
 * Inline back + workspace controls for tenant pages.
 * Embed in the page header — not a full-width bar.
 * Destinations are cache-backed after bootstrap — navigate silently (no chip/spinner).
 */
export function PageWayfinder({ tenantSlug, variant = "compact" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const config = resolvePageWayfinder(pathname, tenantSlug);

  if (!config) return null;
  const fallbackBackHref = config.backHref;

  function go(href: string) {
    navigateWithFeedback(router, href, "push", { silent: true });
  }

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    go(fallbackBackHref);
  }

  const labeled = variant === "labeled";

  return (
    <nav
      className="flex shrink-0 items-center gap-1.5"
      aria-label="Page navigation"
    >
      <button
        type="button"
        onClick={goBack}
        className="wayfinder-btn"
        title={config.backLabel}
        aria-label={`Back to ${config.backLabel}`}
      >
        <ChevronLeft className="h-4 w-4" />
        {labeled ? <span className="hidden sm:inline">{config.backLabel}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => go(config.workspaceHref)}
        className="wayfinder-btn wayfinder-btn-home"
        title="Workspace home"
        aria-label="Go to workspace"
      >
        <Home className="h-4 w-4" />
        {labeled ? <span className="hidden sm:inline">Workspace</span> : null}
      </button>
    </nav>
  );
}
