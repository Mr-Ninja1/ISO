"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type Props = {
  tenantSlug: string;
  status?: "DRAFT" | "SUBMITTED";
  query?: string;
};

export function AuditsExportButton({ tenantSlug, status, query }: Props) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  async function onExport() {
    const token = session?.access_token;
    if (!token || loading) return;

    setLoading(true);
    try {
      const url = new URL("/api/audit/export", window.location.origin);
      url.searchParams.set("tenantSlug", tenantSlug);
      if (status) url.searchParams.set("status", status);
      if (query) url.searchParams.set("q", query);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to export forms");
      }

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `forms-export-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch {
      // Silent fail to avoid breaking forms page interaction.
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={loading || !session?.access_token}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm disabled:opacity-60"
      title={!session?.access_token ? "Sign in required" : "Export filtered forms as CSV"}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? "Exporting..." : "Export CSV"}
    </button>
  );
}
