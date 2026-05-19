"use client";

import { useRouter, usePathname } from "next/navigation";
import { Home, ChevronLeft, Loader2 } from "lucide-react";
import { useState } from "react";

export function PageNavigationBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);

  const canGoBack = pathname && !['/', '/login', '/signup', '/workspace', '/dashboard'].includes(pathname);

  const handleBack = () => {
    setIsLoading(true);
    router.back();
    setTimeout(() => setIsLoading(false), 500);
  };

  const handleHome = () => {
    setIsLoading(true);
    router.push('/workspace');
    setTimeout(() => setIsLoading(false), 500);
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur-sm">
      {canGoBack && (
        <button
          type="button"
          onClick={handleBack}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-2 text-foreground/70 transition hover:bg-foreground/5 disabled:opacity-50"
          title="Go back"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={handleHome}
        disabled={isLoading || pathname === '/workspace'}
        className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm font-medium text-foreground/70 transition hover:bg-foreground/5 disabled:opacity-50"
        title="Go to workspace"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <Home className="h-4 w-4 mr-1" />
        )}
        Workspace
      </button>
    </div>
  );
}
