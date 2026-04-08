"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { FormBuilder } from "@/components/forms/FormBuilder";
import type { FormSection } from "@/types/forms";

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type WorkspaceData = {
  categories: CategorySummary[];
  selectedCategoryId: string | null;
};

export default function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ tenantSlug: string }>();

  const tenantSlug = params?.tenantSlug || "";
  const requestedCategoryId = searchParams.get("categoryId");

  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [title, setTitle] = useState("Custom Form");
  const [sections, setSections] = useState<FormSection[]>([{ type: "fields", title: "Fields", fields: [] }]);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [headerActionsMount, setHeaderActionsMount] = useState<HTMLElement | null>(null);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  useEffect(() => {
    setHeaderActionsMount(document.getElementById("tenant-header-actions"));
  }, []);

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

  async function handleSave(): Promise<boolean> {
    if (!accessToken || !tenantSlug) return false;

    setSaving(true);
    setError("");

    try {
      const schema = {
        version: 1 as const,
        title,
        sections,
      };

      const res = await fetch("/api/templates/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          title,
          categoryId: selectedCategoryId,
          schema,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Create failed (${res.status})`);

      const next = new URLSearchParams();
      next.set("tenantSlug", tenantSlug);
      if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
      router.push(`/workspace?${next.toString()}`);
      return true;
    } catch (err: any) {
      setError(err?.message || "Failed to create template");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const disableSave = saving || workspaceLoading || !title.trim();

  return (
    <div className="relative h-screen overflow-hidden">
      {headerActionsMount
        ? createPortal(
            <div className="mr-1 flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
              <Link
                href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-foreground/20 px-2 text-xs sm:h-7"
              >
                Back
              </Link>
              <Link
                href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-foreground/20 px-2 text-xs sm:h-7"
              >
                Cancel
              </Link>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-foreground px-2 text-xs font-medium text-background disabled:opacity-50 sm:h-7"
                onClick={() => setShowSaveConfirm(true)}
                disabled={disableSave}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>,
            headerActionsMount
          )
        : null}

      {error ? (
        <div className="fixed right-6 top-20 z-40 max-w-[calc(100vw-2rem)] rounded-md border border-foreground/20 bg-background/95 px-2 py-1 text-xs shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="h-full overflow-hidden">
        <FormBuilder
          onChangeSections={setSections}
          initialSections={sections}
          title={title}
          onTitleChange={setTitle}
        />
      </div>

      {showSaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg border border-foreground/20 bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold">Confirm form details</div>
            <div className="mt-1 text-xs text-foreground/70">
              Confirm the category and form title before saving.
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Form title</label>
                <input
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Form title"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={selectedCategoryId ?? ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  disabled={workspaceLoading || saving}
                >
                  <option value="">Uncategorized</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                onClick={() => setShowSaveConfirm(false)}
                disabled={saving}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) setShowSaveConfirm(false);
                }}
                disabled={saving || !title.trim()}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Confirm & save"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
