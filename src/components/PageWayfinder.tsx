"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Home, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
 */
export function PageWayfinder({ tenantSlug, variant = "compact" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState<"back" | "home" | null>(null);
  const config = resolvePageWayfinder(pathname, tenantSlug);

  useEffect(() => {
    setLoading(null);
  }, [pathname]);

  if (!config) return null;

  function go(target: "back" | "home", href: string) {
    if (loading) return;
    setLoading(target);
    navigateWithFeedback(router, href);
  }

  const labeled = variant === "labeled";

  return (
    <nav
      className="flex shrink-0 items-center gap-1.5"
      aria-label="Page navigation"
    >
      <button
        type="button"
        onClick={() => go("back", config.backHref)}
        disabled={loading !== null}
        className="wayfinder-btn"
        title={config.backLabel}
        aria-label={`Back to ${config.backLabel}`}
      >
        {loading === "back" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
        {labeled ? <span className="hidden sm:inline">{config.backLabel}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => go("home", config.workspaceHref)}
        disabled={loading !== null}
        className="wayfinder-btn wayfinder-btn-home"
        title="Workspace home"
        aria-label="Go to workspace"
      >
        {loading === "home" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Home className="h-4 w-4" />
        )}
        {labeled ? <span className="hidden sm:inline">Workspace</span> : null}
      </button>
    </nav>
  );
}
