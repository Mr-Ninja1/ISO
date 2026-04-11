"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { WorkspaceSeedModal } from "@/components/WorkspaceSeedModal";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";

export function TenantCategoriesSeedSection({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const { session } = useAuth();

  const accessToken = session?.access_token || "";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!accessToken) return;
    if (suggestionsLoading) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSuggestions([]);
      return;
    }

    setSuggestionsLoading(true);
    fetch("/api/workspace/suggestions", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load suggestions (${res.status})`);
        return data as { suggestions?: string[] };
      })
      .then((data) => setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [open, accessToken, suggestionsLoading]);

  async function handleSubmit(names: string[]) {
    if (!accessToken) return;

    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine) {
        enqueueBackgroundMutation({
          url: "/api/workspace/seed",
          method: "POST",
          body: { tenantSlug, names },
        });
        setOpen(false);
        setError("Offline: category updates queued and will sync automatically.");
        return;
      }

      const res = await fetch("/api/workspace/seed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, names }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed to add categories (${res.status})`);

      setOpen(false);
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        enqueueBackgroundMutation({
          url: "/api/workspace/seed",
          method: "POST",
          body: { tenantSlug, names },
        });
        setOpen(false);
        setError("Offline: category updates queued and will sync automatically.");
      } else {
        setError(e?.message || "Failed to add categories");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-foreground/20 bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Workspace Categories</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Add more categories anytime. Existing categories won’t be duplicated.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add categories
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <WorkspaceSeedModal
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        onSubmit={handleSubmit}
        busy={busy}
        suggestions={suggestions}
        loadingSuggestions={suggestionsLoading}
      />
    </section>
  );
}
