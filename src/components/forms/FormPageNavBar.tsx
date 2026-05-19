"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Home, Loader2 } from "lucide-react";
import { useState } from "react";

export function FormPageNavBar({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"back" | "home" | null>(null);

  const workspaceHref = tenantSlug
    ? `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "/workspace";
  const auditsHref = tenantSlug ? `/${tenantSlug}/audits` : "/workspace";

  function navigate(target: "back" | "home", href: string) {
    setLoading(target);
    router.push(href);
    window.setTimeout(() => setLoading(null), 600);
  }

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-4 flex items-center gap-2 border-b border-foreground/15 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <button
        type="button"
        onClick={() => navigate("back", auditsHref)}
        disabled={loading !== null}
        className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-foreground/20 px-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
      >
        {loading === "back" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
        Back
      </button>
      <button
        type="button"
        onClick={() => navigate("home", workspaceHref)}
        disabled={loading !== null}
        className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-foreground/20 px-3 text-sm font-medium text-foreground/80 hover:bg-foreground/5 disabled:opacity-50"
      >
        {loading === "home" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}
        Workspace
      </button>
      <Link
        href={auditsHref}
        className="ml-auto text-xs text-foreground/60 underline underline-offset-2 sm:text-sm"
      >
        Stored forms
      </Link>
    </div>
  );
}
