"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tenant, Category } from "@prisma/client";
import { useAuth } from "@/components/AuthProvider";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";
import { NotificationModal } from "@/components/NotificationModal";

type TenantWithCategories = Tenant & { categories: Category[] };

type Props = {
  tenant: TenantWithCategories;
};

type CategoryItem = Pick<Category, "id" | "name" | "sortOrder">;

export function CategoriesManager({ tenant }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryItem[]>(tenant.categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);

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

      const response = await fetch(`/api/categories`, {
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
      // Force a server-side refresh so `workspace` server data is re-fetched
      // and the new category is visible in server-rendered components.
      try { 
        router.refresh();
      } catch (e) {
        // ignore refresh failures in dev
      }
      setTimeout(() => setMessage(""), 2000);
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

      const response = await fetch(`/api/categories/${categoryId}`, {
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
            className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add"}
          </button>
        </div>
      </form>

      {message && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-md border border-foreground/20 p-6 text-center">
          <p className="text-foreground/70">No categories yet. Create one above!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between rounded-md border border-foreground/20 p-4"
            >
              <div>
                <h3 className="font-medium">{cat.name}</h3>
                <p className="text-sm text-foreground/50">Sort order: {cat.sortOrder}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteCategoryId(cat.id)}
                className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      </div>

      <NotificationModal
        open={Boolean(confirmDeleteCategoryId)}
        title="Delete category?"
        message="This category will be removed from the brand."
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
