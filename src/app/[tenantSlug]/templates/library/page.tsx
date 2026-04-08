"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type LibraryTemplateSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

type WorkspaceData = {
  tenant: { slug: string };
  categories: CategorySummary[];
  selectedCategoryId: string | null;
};

export default function TemplatesLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ tenantSlug: string }>();

  const tenantSlug = params?.tenantSlug || "";
  const requestedCategoryId = searchParams.get("categoryId");

  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<LibraryTemplateSummary[]>([]);
  const [importingId, setImportingId] = useState<string>("");

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;
    if (!tenantSlug) return;

    setWorkspaceLoading(true);
    setError("");

    const url = new URL("/api/workspace", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    if (requestedCategoryId) url.searchParams.set("categoryId", requestedCategoryId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load categories (${res.status})`);
        return data as WorkspaceData;
      })
      .then((data) => {
        setCategories(data.categories || []);
        setSelectedCategoryId(data.selectedCategoryId);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load categories");
        setCategories([]);
        setSelectedCategoryId(null);
      })
      .finally(() => setWorkspaceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, requestedCategoryId]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;

    setLibraryLoading(true);
    setError("");

    fetch("/api/template-library", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load template library (${res.status})`);
        return data as { templates: LibraryTemplateSummary[] };
      })
      .then((data) => setTemplates(data.templates || []))
      .catch((err) => {
        setTemplates([]);
        setError(err?.message || "Failed to load template library");
      })
      .finally(() => setLibraryLoading(false));
  }, [authLoading, user, accessToken]);

  async function importTemplate(libraryTemplateId: string) {
    if (!accessToken || !tenantSlug) return;

    setImportingId(libraryTemplateId);
    setError("");
    try {
      const res = await fetch("/api/templates/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          libraryTemplateId,
          categoryId: selectedCategoryId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = data?.details?.formErrors?.length
          ? ` (${data.details.formErrors.join(", ")})`
          : "";
        throw new Error((data?.error || `Import failed (${res.status})`) + details);
      }

      const next = new URLSearchParams();
      next.set("tenantSlug", tenantSlug);
      if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
      router.push(`/workspace?${next.toString()}`);
    } catch (err: any) {
      setError(err?.message || "Import failed");
    } finally {
      setImportingId("");
    }
  }

  const busy = workspaceLoading || libraryLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Template library</h2>
          <p className="text-sm text-foreground/70">Add a standard form into one of your categories.</p>
        </div>
        <Link href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`} className="text-sm underline">
          Back to workspace
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-foreground/20 bg-background p-3 text-sm">{error}</div>
      ) : null}

      <div className="rounded-lg border border-foreground/20 bg-background p-4">
        <div className="text-sm font-medium">Category</div>
        <div className="mt-2 relative">
          <select
            className="h-11 w-full appearance-none rounded-md border border-foreground/20 bg-background px-3 pr-10"
            value={selectedCategoryId ?? ""}
            onChange={(e) => setSelectedCategoryId(e.target.value || null)}
            disabled={workspaceLoading}
          >
            <option value="">Uncategorized</option>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60" />
        </div>
      </div>

      <div className="grid gap-2">
        {busy ? (
          <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
            No templates in the library yet.
          </div>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-4 rounded-md border border-foreground/20 bg-background p-4"
            >
              <div className="font-medium">{t.title}</div>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
                onClick={() => importTemplate(t.id)}
                disabled={importingId === t.id}
              >
                {importingId === t.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add
                  </>
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
