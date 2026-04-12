"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function RefreshPageButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 700);
      }}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm"
      disabled={refreshing}
    >
      {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {refreshing ? "Refreshing..." : label}
    </button>
  );
}
