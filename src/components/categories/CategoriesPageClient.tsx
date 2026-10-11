"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CategoriesManager } from "@/components/CategoriesManager";
import { apiUrl } from "@/lib/client/apiBase";
import { useResolvedTenantSlug } from "@/lib/client/resolveTenantSlug";
import { useAppOffline } from "@/lib/client/useAppOffline";
import {
  readWorkspaceCacheResolved,
  writeWorkspaceCache,
  type WorkspaceData,
} from "@/lib/client/workspaceCache";
import { scheduleIdleWork, shouldPauseBackgroundWork } from "@/lib/client/interactionGate";
import { buildWorkspaceFormsHref } from "@/lib/client/workspaceNavigation";
import { navigateWithFeedback } from "@/lib/client/navigationLoading";

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

function tenantFromWorkspaceCache(
  userId: string | null,
  tenantSlug: string,
): TenantWithCategories | null {
  const cached = readWorkspaceCacheResolved(userId, tenantSlug, null);
  if (!cached?.tenant?.id) return null;
  const now = new Date();
  return {
    id: cached.tenant.id,
    name: cached.tenant.name,
    slug: cached.tenant.slug,
    logoUrl: cached.tenant.logoUrl ?? null,
    createdAt: now,
    updatedAt: now,
    categories: (cached.categories || []).map((c) => ({
      id: c.id,
      tenantId: cached.tenant.id,
      name: c.name,
      sortOrder: c.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

export function CategoriesPageClient({ routeSlug }: { routeSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const router = useRouter();
  const { session, user } = useAuth();
  const offline = useAppOffline();
  const userId = user?.id || session?.user?.id || null;
  const accessToken = session?.access_token || "";

  const [tenant, setTenant] = useState<TenantWithCategories | null>(() =>
    tenantSlug ? tenantFromWorkspaceCache(userId, tenantSlug) : null,
  );
  const [loading, setLoading] = useState(() => !tenant);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      setError("No brand selected.");
      return;
    }

    const cached = tenantFromWorkspaceCache(userId, tenantSlug);
    if (cached) {
      setTenant(cached);
      setLoading(false);
      setError("");
    }
  }, [tenantSlug, userId]);

  useEffect(() => {
    if (!tenantSlug || !accessToken || offline) {
      if (!tenant) setLoading(false);
      return;
    }

    let cancelled = false;
    // Soft revalidate — never blank a cache-painted screen for network.
    if (!tenant) setLoading(true);
    setError("");

    const run = () => {
      if (cancelled || shouldPauseBackgroundWork()) return;

      const workspaceUrl = new URL(apiUrl("/api/workspace"));
      workspaceUrl.searchParams.set("tenantSlug", tenantSlug);

      const categoriesUrl = new URL(apiUrl("/api/categories"));
      categoriesUrl.searchParams.set("tenantSlug", tenantSlug);

      const headers = { Authorization: `Bearer ${accessToken}` };

      Promise.all([
        fetch(workspaceUrl.toString(), { headers }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || `Failed to load brand (${res.status})`);
          return json as WorkspaceData;
        }),
        fetch(categoriesUrl.toString(), { headers }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error || `Failed to load categories (${res.status})`);
          return (json.categories || []) as Array<{ id: string; name: string; sortOrder?: number }>;
        }),
      ])
        .then(([workspaceJson, categoryRows]) => {
          if (cancelled || !workspaceJson.tenant?.id) return;
          writeWorkspaceCache(userId, tenantSlug, null, workspaceJson, { silent: true });
          const now = new Date();
          setTenant({
            id: workspaceJson.tenant.id,
            name: workspaceJson.tenant.name,
            slug: workspaceJson.tenant.slug,
            logoUrl: workspaceJson.tenant.logoUrl ?? null,
            createdAt: now,
            updatedAt: now,
            categories: categoryRows.map((c) => ({
              id: c.id,
              tenantId: workspaceJson.tenant.id,
              name: c.name,
              sortOrder: c.sortOrder ?? 0,
              createdAt: now,
              updatedAt: now,
            })),
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (!tenant) setError(err instanceof Error ? err.message : "Failed to load categories");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    // Defer network until the route has painted — keeps online open as fast as offline.
    const cancelIdle = scheduleIdleWork(run, tenant ? 280 : 0);

    return () => {
      cancelled = true;
      cancelIdle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint from cache; refresh on auth/online/tenant
  }, [tenantSlug, accessToken, offline, userId]);

  if (!tenantSlug) {
    return (
      <div className="rounded-md border border-foreground/20 p-4 text-sm">
        <Link href="/workspace" className="underline">
          Go to workspace
        </Link>
      </div>
    );
  }

  if (loading && !tenant) {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading categories...
      </div>
    );
  }

  if (error && !tenant) {
    return <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>;
  }

  if (!tenant) {
    return (
      <div className="rounded-md border border-foreground/20 p-4 text-sm text-foreground/70">
        Brand not found. Open the workspace online once, then return here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Form Categories</h2>
          <p className="text-sm text-foreground/70">Organize your audit forms by category</p>
        </div>
        <Link
          className="text-sm underline sm:text-right"
          href={buildWorkspaceFormsHref(tenantSlug)}
          onClick={(e) => {
            e.preventDefault();
            navigateWithFeedback(router, buildWorkspaceFormsHref(tenantSlug), "push", {
              silent: true,
            });
          }}
        >
          Back to workspace
        </Link>
      </div>
      <CategoriesManager tenant={tenant} />
    </div>
  );
}
