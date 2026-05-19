"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { TenantSettingsForm } from "@/components/TenantSettingsForm";
import { TenantCategoriesSeedSection } from "@/components/TenantCategoriesSeedSection";
import { TemplateManagementPanel } from "@/components/TemplateManagementPanel";
import { DeferredDetailsSection } from "@/components/DeferredDetailsSection";
import { FeatureSyncNotice } from "@/components/FeatureSyncNotice";
import { RouteOfflineGate } from "@/components/RouteOfflineGate";
import { SearchParamsBoundary } from "@/components/SearchParamsBoundary";
import { TenantSettingsStaffSection } from "@/components/TenantSettingsStaffSection";
import { apiUrl } from "@/lib/client/apiBase";
import {
  readTenantMetaFromWorkspaceCache,
  useResolvedTenantSlug,
} from "@/lib/client/resolveTenantSlug";
import { useAppOffline } from "@/lib/client/useAppOffline";

type TemplateRow = {
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string;
  updatedAt: string;
};

type TenantMeta = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export function SettingsPageClient({ routeSlug }: { routeSlug: string }) {
  const tenantSlug = useResolvedTenantSlug(routeSlug);
  const { session, user } = useAuth();
  const offline = useAppOffline();
  const userId = user?.id || session?.user?.id || null;
  const accessToken = session?.access_token || "";

  const [tenant, setTenant] = useState<TenantMeta | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      setError("No brand selected. Open the workspace and choose a brand first.");
      return;
    }

    const cached = readTenantMetaFromWorkspaceCache(userId, tenantSlug);
    if (cached?.id) {
      setTenant({
        id: cached.id,
        name: cached.name,
        slug: cached.slug,
        logoUrl: cached.logoUrl ?? null,
      });
    }
  }, [tenantSlug, userId]);

  useEffect(() => {
    if (!tenantSlug || !accessToken) {
      if (!tenantSlug) return;
      if (!accessToken) setLoading(false);
      return;
    }

    if (offline) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const url = new URL(apiUrl("/api/workspace"));
    url.searchParams.set("tenantSlug", tenantSlug);

    fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || `Failed to load brand (${res.status})`);
        return json as {
          tenant?: TenantMeta;
          categories?: Array<{ id: string; name: string }>;
          templates?: Array<{
            id: string;
            title: string;
            categoryId: string | null;
            updatedAt: string;
          }>;
        };
      })
      .then((data) => {
        if (cancelled) return;
        if (data.tenant?.id) {
          setTenant({
            id: data.tenant.id,
            name: data.tenant.name,
            slug: data.tenant.slug,
            logoUrl: data.tenant.logoUrl ?? null,
          });
        }
        const categoryById = new Map((data.categories || []).map((c) => [c.id, c.name]));
        const nextTemplates = (data.templates || []).map((t) => ({
          id: t.id,
          title: t.title,
          categoryId: t.categoryId,
          categoryName: t.categoryId ? categoryById.get(t.categoryId) || "Uncategorized" : "Uncategorized",
          updatedAt: t.updatedAt,
        }));
        setTemplates(nextTemplates);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load brand settings";
        if (!tenant) setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, accessToken, offline, tenant]);

  const backHref = useMemo(
    () => `/workspace/forms?tenantSlug=${encodeURIComponent(tenantSlug || "")}`,
    [tenantSlug]
  );

  if (!tenantSlug) {
    return (
      <div className="rounded-md border border-foreground/20 bg-foreground/5 p-4 text-sm">
        No brand selected.{" "}
        <Link href="/workspace" className="underline">
          Go to workspace
        </Link>
      </div>
    );
  }

  return (
    <RouteOfflineGate
      title="Settings needs internet"
      message="Brand settings, staff, categories, and template management are live-sync features. Open this page online so the route can load and keep its data cached for later offline use."
      hint="The individual controls stay blocked offline so changes cannot drift out of sync."
      backHref={backHref}
      backLabel="Back to workspace"
    >
      <div className="flex flex-col gap-6">
        <FeatureSyncNotice
          title="Live database sync"
          message="Brand settings, staff, categories, and template management are live-sync features. They can show cached data while offline, but changes need internet so they can update the database and stay in sync across devices."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-xl font-semibold">Brand Settings</h2>
            <p className="text-sm text-foreground/70">
              {tenant?.name ? tenant.name : "Manage your brand details"}
              {tenant?.slug ? ` · /${tenant.slug}` : null}
            </p>
          </div>
          <Link className="text-sm underline sm:text-right" href={backHref}>
            Back to workspace
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-md border border-foreground/20 bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading brand settings...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-md border border-foreground/20 bg-background p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            href={`/${tenantSlug}/templates/new`}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5 sm:w-auto"
          >
            Create custom form
          </Link>
          <Link
            href={`/${tenantSlug}/templates/library`}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5 sm:w-auto"
          >
            Import from library
          </Link>
        </div>

        <DeferredDetailsSection title="Brand profile" defaultOpen>
          <TenantSettingsForm tenant={tenant ?? undefined} tenantSlug={tenantSlug} />
        </DeferredDetailsSection>

        <DeferredDetailsSection title="Form management">
          <TemplateManagementPanel tenantSlug={tenantSlug} templates={templates} />
        </DeferredDetailsSection>

        <DeferredDetailsSection title="Category tools">
          <TenantCategoriesSeedSection tenantSlug={tenantSlug} />
        </DeferredDetailsSection>

        <SearchParamsBoundary>
          <TenantSettingsStaffSection tenantSlug={tenantSlug} />
        </SearchParamsBoundary>
      </div>
    </RouteOfflineGate>
  );
}
