"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";
import { NotificationModal } from "@/components/NotificationModal";
import { requestWorkspaceRevalidate } from "@/lib/client/requestWorkspaceRevalidate";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { OfflineRouteBlock } from "@/components/OfflineRouteBlock";
import { apiUrl } from "@/lib/client/apiBase";

type CategoryRow = {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type TenantWithCategories = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  categories: CategoryRow[];
};

type Props = {
  tenant: TenantWithCategories;
};

type CategoryItem = Pick<CategoryRow, "id" | "name" | "sortOrder">;

type TemplateItem = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
};

export function CategoriesManager({ tenant }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const offline = useAppOffline();
  const [categories, setCategories] = useState<CategoryItem[]>(tenant.categories);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [movingTemplateId, setMovingTemplateId] = useState<string | null>(null);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || offline) return;

    let cancelled = false;
    setTemplatesLoading(true);
    setMessage("");

    const categoriesUrl = new URL(apiUrl("/api/categories"));
    categoriesUrl.searchParams.set("tenantSlug", tenant.slug);

    const templatesUrl = new URL(apiUrl("/api/templates/list"));
    templatesUrl.searchParams.set("tenantSlug", tenant.slug);

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(categoriesUrl.toString(), { headers }).then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Failed to load categories (${res.status})`);
        return (json.categories || []) as Array<{ id: string; name: string; sortOrder?: number }>;
      }),
      fetch(templatesUrl.toString(), { headers }).then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Failed to load forms (${res.status})`);
        return (json.templates || []) as Array<{
          id: string;
          title: string;
          categoryId?: string | null;
        }>;
      }),
    ])
      .then(([cats, rows]) => {
        if (cancelled) return;
        const now = new Date();
        setCategories(
          cats.map((c) => ({
            id: c.id,
            name: c.name,
            sortOrder: c.sortOrder ?? 0,
          }))
        );
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        setTemplates(
          rows.map((t) => ({
            id: t.id,
            title: t.title,
            categoryId: t.categoryId ?? null,
            categoryName: t.categoryId ? catMap.get(t.categoryId) || "Uncategorized" : "Uncategorized",
          }))
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTemplates([]);
        setMessage(err instanceof Error ? err.message : "Failed to load brand categories and forms");
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, tenant.slug, tenant.id, offline]);

  if (offline) {
    return (
      <OfflineRouteBlock
        title="Categories need internet"
        message="Category changes update live brand forms, so this screen is disabled offline. Connect once to manage categories and keep them cached locally."
        backHref={`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`}
        backLabel="Back to workspace"
      />
    );
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      if (!navigator.onLine) {
        const optimistic: CategoryItem = {
          id: `local_${Date.now()}`,
          name: newCategoryName.trim(),
          sortOrder: 0,
        };
        setCategories((prev) => [...prev, optimistic]);
        // Update local workspace cache so other parts of the app see the new category immediately
        try {
          const userId = session?.user?.id ?? null;
          const tenantSlug = tenant.slug;
          const cacheKey = `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:all`;
          const existingRaw = localStorage.getItem(cacheKey);
          let existing = null as any;
          if (existingRaw) {
            try { existing = JSON.parse(existingRaw); } catch { existing = null; }
          }
          const nextWorkspace = existing?.data || { tenant: { slug: tenantSlug }, categories: tenant.categories.map(c => ({ id: c.id })), selectedCategoryId: null };
          nextWorkspace.categories = [...(nextWorkspace.categories || []).map((c: any) => ({ id: c.id })), { id: optimistic.id, name: optimistic.name, sortOrder: optimistic.sortOrder }];
          const envelope = { ts: Date.now(), data: nextWorkspace };
          localStorage.setItem(cacheKey, JSON.stringify(envelope));
          window.dispatchEvent(new CustomEvent("workspace-cache-updated", { detail: { tenantSlug, categoryId: null } }));
        } catch {}
        enqueueBackgroundMutation({
          url: "/api/categories",
          method: "POST",
          body: {
            tenantId: tenant.id,
            name: newCategoryName.trim(),
          },
        });
        setNewCategoryName("");
        setMessage("Offline: category queued and will sync automatically.");
        return;
      }

      const response = await fetch(apiUrl("/api/categories"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          name: newCategoryName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create category");
      }

      const newCategory = await response.json();
      setCategories([...categories, newCategory]);
      setNewCategoryName("");
      setMessage("Category created!");
      requestWorkspaceRevalidate(tenant.slug);
      // Clear all workspace caches for this tenant to force fresh data
      try {
        const userId = session?.user?.id ?? null;
        const prefix = `workspace-cache:v2:${userId || "anon"}:${tenant.slug}:`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore cache clear failures
      }
      // Force a server-side refresh so `workspace` server data is re-fetched
      // and the new category is visible in server-rendered components.
      try {
        router.refresh();
      } catch (e) {
        // ignore refresh failures in dev
      }
      setTimeout(() => {
        router.push(`/workspace/forms?tenantSlug=${encodeURIComponent(tenant.slug)}`);
      }, 500);
    } catch (error: any) {
      const msg = String(error?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const optimistic: CategoryItem = {
          id: `local_${Date.now()}`,
          name: newCategoryName.trim(),
          sortOrder: 0,
        };
        setCategories((prev) => [...prev, optimistic]);
        // write to local workspace cache so the change is visible immediately
        try {
          const userId = session?.user?.id ?? null;
          const tenantSlug = tenant.slug;
          const cacheKey = `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:all`;
          const existingRaw = localStorage.getItem(cacheKey);
          let existing = null as any;
          if (existingRaw) {
            try { existing = JSON.parse(existingRaw); } catch { existing = null; }
          }
          const nextWorkspace = existing?.data || { tenant: { slug: tenantSlug }, categories: tenant.categories.map(c => ({ id: c.id })), selectedCategoryId: null };
          nextWorkspace.categories = [...(nextWorkspace.categories || []).map((c: any) => ({ id: c.id })), { id: optimistic.id, name: optimistic.name, sortOrder: optimistic.sortOrder }];
          const envelope = { ts: Date.now(), data: nextWorkspace };
          localStorage.setItem(cacheKey, JSON.stringify(envelope));
          window.dispatchEvent(new CustomEvent("workspace-cache-updated", { detail: { tenantSlug, categoryId: null } }));
        } catch {}
        enqueueBackgroundMutation({
          url: "/api/categories",
          method: "POST",
          body: {
            tenantId: tenant.id,
            name: newCategoryName.trim(),
          },
        });
        setNewCategoryName("");
        setMessage("Offline: category queued and will sync automatically.");
      } else {
        setMessage(error.message || "Failed to create category");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      if (!navigator.onLine) {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        if (!categoryId.startsWith("local_")) {
          enqueueBackgroundMutation({
            url: `/api/categories/${categoryId}`,
            method: "DELETE",
          });
        }
        setMessage("Offline: delete queued and will sync automatically.");
        return;
      }

      const response = await fetch(apiUrl(`/api/categories/${categoryId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete");
      }

      setCategories(categories.filter((c) => c.id !== categoryId));
      requestWorkspaceRevalidate(tenant.slug);
      // Clear all workspace caches for this tenant to force fresh data
      try {
        const userId = session?.user?.id ?? null;
        const prefix = `workspace-cache:v2:${userId || "anon"}:${tenant.slug}:`;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // ignore cache clear failures
      }
    } catch (error: any) {
      const msg = String(error?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        if (!categoryId.startsWith("local_")) {
          enqueueBackgroundMutation({
            url: `/api/categories/${categoryId}`,
            method: "DELETE",
          });
        }
        setMessage("Offline: delete queued and will sync automatically.");
      } else {
        setMessage(error.message || "Failed to delete category");
      }
    }
  }

  async function handleRenameCategory(categoryId: string) {
    const name = editingName.trim();
    if (!name) return;

    setLoading(true);
    setMessage("");
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const response = await fetch(apiUrl(`/api/categories/${categoryId}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to rename");

      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name } : c)));
      setEditingId(null);
      setEditingName("");
      setMessage("Category renamed.");
      requestWorkspaceRevalidate(tenant.slug);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Failed to rename category");
    } finally {
      setLoading(false);
    }
  }

  async function handleMoveTemplate(templateId: string, categoryId: string) {
    setMovingTemplateId(templateId);
    setMessage("");
    try {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const res = await fetch(apiUrl("/api/templates/set-category"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug: tenant.slug,
          templateId,
          categoryId: categoryId || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to move form");

      const label = categoryId ? categoryNameById.get(categoryId) || "category" : "Uncategorized";
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, categoryId: categoryId || null, categoryName: label }
            : t
        )
      );
      setMessage("Form moved.");
      requestWorkspaceRevalidate(tenant.slug);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Failed to move form");
    } finally {
      setMovingTemplateId(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
      <form onSubmit={handleAddCategory} className="rounded-md border border-foreground/20 p-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name (e.g., 'Kitchen')"
            className="flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading || !newCategoryName.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 font-medium text-background shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </form>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {categories.length === 0 ? (
        <div className="rounded-md border border-foreground/20 p-6 text-center">
          <p className="text-foreground/70">No categories yet. Create one above!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex flex-col gap-3 rounded-md border border-foreground/20 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              {editingId === cat.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={loading || !editingName.trim()}
                    onClick={() => void handleRenameCategory(cat.id)}
                    className="inline-flex h-9 items-center gap-1 rounded-md bg-foreground px-3 text-sm text-background disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditingName("");
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-foreground/20 px-3 text-sm"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="font-medium">{cat.name}</h3>
                    <p className="text-sm text-foreground/50">
                      {templates.filter((t) => t.categoryId === cat.id).length} form(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCategoryId(cat.id)}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="rounded-md border border-foreground/20 p-4">
        <h3 className="text-base font-semibold">Move forms between categories</h3>
        <p className="mt-1 text-sm text-foreground/70">
          Reassign a form to another category without opening the form editor.
        </p>

        {templatesLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-foreground/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading forms…
          </div>
        ) : templates.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/60">No forms in this brand yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 rounded-md border border-foreground/15 bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="text-xs text-foreground/60">Currently: {t.categoryName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 min-w-[10rem] rounded-md border border-foreground/20 bg-background px-2 text-sm"
                    value={t.categoryId || ""}
                    disabled={movingTemplateId === t.id}
                    onChange={(e) => {
                      const next = e.target.value;
                      void handleMoveTemplate(t.id, next);
                    }}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {movingTemplateId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      <NotificationModal
        open={Boolean(confirmDeleteCategoryId)}
        title="Delete category?"
        message="Forms in this category become uncategorized. This cannot be undone."
        tone="warning"
        actionLabel="Delete"
        actionTone="danger"
        onAction={async () => {
          if (!confirmDeleteCategoryId) return;
          const id = confirmDeleteCategoryId;
          setConfirmDeleteCategoryId(null);
          await handleDeleteCategory(id);
        }}
        onClose={() => setConfirmDeleteCategoryId(null)}
      />
    </>
  );
}
