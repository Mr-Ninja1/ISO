"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiUrl } from "@/lib/client/apiBase";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import {
  readWorkspaceCacheResolved,
  writeWorkspaceCache,
  type WorkspaceData,
} from "@/lib/client/workspaceCache";
import { useAppOffline } from "@/lib/client/useAppOffline";
import { buildTenantHref } from "@/lib/client/tenantHref";
import { buildWorkspaceFormsHref } from "@/lib/client/workspaceNavigation";

type CategoryRow = { id: string; name: string; sortOrder: number };
type TemplateRow = {
  id: string;
  title: string;
  categoryId: string | null;
  updatedAt: string;
};

function applyCachedLists(
  cached: WorkspaceData | null,
  setCategories: (rows: CategoryRow[]) => void,
  setTemplates: (rows: TemplateRow[]) => void
) {
  if (!cached) return;
  setCategories(
    (cached.categories || []).map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder ?? 0,
    }))
  );
  setTemplates(
    (cached.templates || []).map((t) => ({
      id: t.id,
      title: t.title,
      categoryId: t.categoryId ?? null,
      updatedAt: t.updatedAt,
    }))
  );
}

export function TemplatesPageClient({ routeSlug }: { routeSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const { session, user } = useAuth();
  const offline = useAppOffline();
  const userId = user?.id || session?.user?.id || null;
  const accessToken = session?.access_token || "";

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onCache = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantSlug?: string }>).detail;
      if (detail?.tenantSlug && detail.tenantSlug !== tenantSlug) return;
      setTick((x) => x + 1);
    };
    window.addEventListener("workspace-cache-updated", onCache as EventListener);
    window.addEventListener("workspace-invalidate", onCache as EventListener);
    return () => {
      window.removeEventListener("workspace-cache-updated", onCache as EventListener);
      window.removeEventListener("workspace-invalidate", onCache as EventListener);
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      setError("No brand selected.");
      return;
    }

    const cached = readWorkspaceCacheResolved(userId, tenantSlug, null);
    if (cached) {
      applyCachedLists(cached, setCategories, setTemplates);
      setLoading(false);
      setError("");
    }

    if (!accessToken || offline) {
      setLoading(false);
      if (!cached) setError("Templates are not cached on this device yet. Connect once to download them.");
      return;
    }

    let cancelled = false;
    setError("");

    const url = new URL(apiUrl("/api/workspace"));
    url.searchParams.set("tenantSlug", tenantSlug);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load templates (${res.status})`);
        return data as WorkspaceData;
      })
      .then((data) => {
        if (cancelled) return;
        writeWorkspaceCache(userId, tenantSlug, null, data);
        applyCachedLists(data, setCategories, setTemplates);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!cached) setError(err?.message || "Failed to load templates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, accessToken, offline, userId, tick]);

  const templatesByCategoryId = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const template of templates) {
      const key = template.categoryId ?? "uncategorized";
      map.set(key, [...(map.get(key) ?? []), template]);
    }
    return map;
  }, [templates]);

  const workspaceHref = buildWorkspaceFormsHref(tenantSlug);
  const createHref = buildTenantHref(tenantSlug, "templates/new");

  if (!tenantSlug) {
    return (
      <div className="rounded-md border border-foreground/20 p-4 text-sm text-foreground/70">
        Select a brand from the workspace to browse templates.
      </div>
    );
  }

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-4 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates…
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">{error}</div>
        <Link href={workspaceHref} className="text-sm underline">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl font-semibold">Templates</h2>
          <p className="text-sm text-foreground/70">Open a form to fill it, or create a new one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={createHref}
            className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background"
          >
            Create form
          </Link>
          <Link href={workspaceHref} className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm">
            Workspace
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {categories.map((cat) => (
          <section key={cat.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground/80">{cat.name}</h3>
            <div className="grid gap-2">
              {(templatesByCategoryId.get(cat.id) ?? []).map((t) => (
                <Link
                  key={t.id}
                  className="rounded-md border border-foreground/20 p-4"
                  href={buildTenantHref(tenantSlug, "audits/new", { templateId: t.id })}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{t.title}</div>
                    <span className="text-sm text-foreground/70">Run</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {(templatesByCategoryId.get("uncategorized") ?? []).length ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground/80">Uncategorized</h3>
            <div className="grid gap-2">
              {(templatesByCategoryId.get("uncategorized") ?? []).map((t) => (
                <Link
                  key={t.id}
                  className="rounded-md border border-foreground/20 p-4"
                  href={buildTenantHref(tenantSlug, "audits/new", { templateId: t.id })}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{t.title}</div>
                    <span className="text-sm text-foreground/70">Run</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {templates.length === 0 ? (
          <div className="rounded-md border border-foreground/20 bg-background p-4 text-sm text-foreground/70">
            No templates yet. Create a form to get started.
          </div>
        ) : null}
      </div>
    </div>
  );
}
