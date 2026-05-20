"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Plus } from "lucide-react";
import { buildTenantHref } from "@/lib/client/tenantHref";
import { useAuth } from "@/components/AuthProvider";
import { WorkspaceSeedModal } from "@/components/WorkspaceSeedModal";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { apiUrl } from "@/lib/client/apiBase";

export function TenantCategoriesSeedSection({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const offline = useAppOffline();

  const accessToken = session?.access_token || "";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsFetchedRef = useRef(false);

  if (offline) {
    return (
      <OfflineRouteBlock
        title="Categories need internet"
        message="Category changes update the brand's live form structure. Connect once to manage categories, then the cached workspace can keep using them offline."
        backHref={`/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug)}`}
        backLabel="Back to workspace"
      />
    );
  }

  useEffect(() => {
    if (!open) {
      suggestionsFetchedRef.current = false;
      return;
    }
    if (!accessToken) return;
    if (suggestionsFetchedRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSuggestions([]);
      return;
    }

    suggestionsFetchedRef.current = true;
    setSuggestionsLoading(true);
    const controller = new AbortController();
    fetch(apiUrl("/api/workspace/suggestions"), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load suggestions (${res.status})`);
        return data as { suggestions?: string[] };
      })
      .then((data) => setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []))
      .catch(() => {
        suggestionsFetchedRef.current = false;
        setSuggestions([]);
      })
      .finally(() => setSuggestionsLoading(false));

    return () => controller.abort();
  }, [open, accessToken]);

  async function handleSubmit(names: string[]) {
    if (!accessToken) return;

    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine) {
        enqueueBackgroundMutation({
          url: apiUrl("/api/workspace/seed"),
          method: "POST",
          body: { tenantSlug, names },
        });
        setOpen(false);
        setError("Offline: category updates queued and will sync automatically.");
        return;
      }

      const res = await fetch(apiUrl("/api/workspace/seed"), {
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
      requestWorkspaceRevalidate(tenantSlug);
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        enqueueBackgroundMutation({
          url: apiUrl("/api/workspace/seed"),
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add categories
          </button>
          <Link
            href={buildTenantHref(tenantSlug, "categories")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-foreground/20 px-3 text-sm font-medium hover:bg-foreground/5"
          >
            <FolderTree className="h-4 w-4" />
            Manage categories
          </Link>
        </div>
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
