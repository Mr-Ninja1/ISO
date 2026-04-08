"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type TemplateItem = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
  updatedAt: string;
};

export function TemplateManagementPanel({
  tenantSlug,
  templates,
}: {
  tenantSlug: string;
  templates: TemplateItem[];
}) {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.access_token || "";

  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      return t.title.toLowerCase().includes(q) || t.categoryName.toLowerCase().includes(q);
    });
  }, [query, templates]);

  async function handleDelete(templateId: string, title: string) {
    if (!accessToken) {
      setMessage("Please sign in again.");
      return;
    }

    const ok = window.confirm(`Delete '${title}' from the system? This cannot be undone.`);
    if (!ok) return;

    setDeletingId(templateId);
    setMessage("");

    try {
      const res = await fetch("/api/templates/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, templateId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }

      setMessage("Form deleted.");
      router.refresh();
    } catch (err: any) {
      setMessage(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-md border border-foreground/20 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Edit Forms</h3>
          <p className="text-sm text-foreground/70">Search, edit structure, or delete forms.</p>
        </div>
        <div className="text-xs text-foreground/60">Admin tools</div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md border border-foreground/20 bg-background px-3">
        <Search className="h-4 w-4 text-foreground/60" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search forms by title or category"
          className="h-10 w-full bg-transparent text-sm outline-none"
        />
      </div>

      {message ? (
        <div className="mt-3 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm">
          {message}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-foreground/20 bg-foreground/[0.02] px-3 py-4 text-sm text-foreground/70">
            No forms found.
          </div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-foreground/20 bg-background px-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{t.title}</div>
                <div className="mt-0.5 text-xs text-foreground/60">
                  {t.categoryName} • Updated {new Date(t.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-foreground/20 px-2 text-xs hover:bg-foreground/5"
                  onClick={() => {
                    router.push(
                      `/${tenantSlug}/templates/new?editTemplateId=${encodeURIComponent(t.id)}&categoryId=${encodeURIComponent(t.categoryId || "")}`
                    );
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>

                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-300 px-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                  onClick={() => handleDelete(t.id, t.title)}
                  disabled={deletingId === t.id}
                >
                  {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
