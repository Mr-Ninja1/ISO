"use client";

import { useState } from "react";
import type { Tenant, Category } from "@prisma/client";

type TenantWithCategories = Tenant & { categories: Category[] };

type Props = {
  tenant: TenantWithCategories;
};

export function CategoriesManager({ tenant }: Props) {
  const [categories, setCategories] = useState(tenant.categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      setTimeout(() => setMessage(""), 2000);
    } catch (error: any) {
      setMessage(error.message || "Failed to create category");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm("Delete this category?")) return;

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      setCategories(categories.filter((c) => c.id !== categoryId));
    } catch (error: any) {
      setMessage(error.message || "Failed to delete category");
    }
  }

  return (
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
                onClick={() => handleDeleteCategory(cat.id)}
                className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
