"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard, Loader2, MoreVertical, Plus, Settings } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AddFormOptionsModal } from "@/components/AddFormOptionsModal";
import { ConnectivityIndicator } from "@/components/ConnectivityIndicator";
import { WorkspaceSeedModal } from "@/components/WorkspaceSeedModal";

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type TemplateSummary = {
  id: string;
  title: string;
  updatedAt: string;
  categoryId: string | null;
};

type WorkspaceData = {
  tenant: TenantSummary;
  categories: CategorySummary[];
  selectedCategoryId: string | null;
  templates: TemplateSummary[];
  isAdmin: boolean;
};

function WorkspaceSkeleton() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-10 border-b border-foreground/10 bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-md border border-foreground/20 bg-foreground/5" />
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-foreground/5" />
              <div className="h-3 w-28 animate-pulse rounded bg-foreground/5" />
            </div>
          </div>
          <div className="h-6 w-20 animate-pulse rounded bg-foreground/5" />
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-3">
          <div className="h-9 w-full animate-pulse rounded bg-foreground/5" />
        </div>
      </div>
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <div className="h-14 w-full animate-pulse rounded-md border border-foreground/20 bg-foreground/5" />
        <div className="h-14 w-full animate-pulse rounded-md border border-foreground/20 bg-foreground/5" />
        <div className="h-14 w-full animate-pulse rounded-md border border-foreground/20 bg-foreground/5" />
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading, signOut } = useAuth();

  const tenantSlug = searchParams.get("tenantSlug") || "";
  const categoryId = searchParams.get("categoryId");

  const accessToken = session?.access_token || "";

  const [tenantChoices, setTenantChoices] = useState<TenantSummary[]>([]);
  const [tenantChoiceLoading, setTenantChoiceLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [switchingCategory, setSwitchingCategory] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState<string>("");

  const [seedOpen, setSeedOpen] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [addFormOpen, setAddFormOpen] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [uiActiveCategoryId, setUiActiveCategoryId] = useState<string | null>(null);

  async function handleLogout() {
    try {
      setMenuOpen(false);
      await signOut();
    } finally {
      router.push("/login");
    }
  }

  function handleAddFromTemplates(selectedCategoryId: string | null) {
    if (!workspace) return;
    setAddFormOpen(false);
    const qs = new URLSearchParams();
    if (selectedCategoryId) qs.set("categoryId", selectedCategoryId);
    const suffix = qs.toString();
    router.push(`/${workspace.tenant.slug}/templates/library${suffix ? `?${suffix}` : ""}`);
  }

  function handleCreateCustomForm(selectedCategoryId: string | null) {
    if (!workspace) return;
    setAddFormOpen(false);
    const qs = new URLSearchParams();
    if (selectedCategoryId) qs.set("categoryId", selectedCategoryId);
    const suffix = qs.toString();
    router.push(`/${workspace.tenant.slug}/templates/new${suffix ? `?${suffix}` : ""}`);
  }

  const showTenantPicker = useMemo(
    () => !tenantSlug && tenantChoices.length > 1,
    [tenantSlug, tenantChoices.length]
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;

    if (tenantSlug) return;

    const last = localStorage.getItem("lastTenantSlug") || "";
    if (last) {
      router.replace(`/workspace?tenantSlug=${encodeURIComponent(last)}`);
      return;
    }

    setTenantChoiceLoading(true);
    setError("");

    fetch("/api/tenants", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load brands (${res.status})`);
        return data;
      })
      .then((data) => {
        const tenants = (data.tenants || []) as TenantSummary[];
        setTenantChoices(tenants);

        if (tenants.length === 0) {
          router.push("/onboarding");
          return;
        }

        if (tenants.length === 1) {
          const slug = tenants[0].slug;
          localStorage.setItem("lastTenantSlug", slug);
          router.replace(`/workspace?tenantSlug=${encodeURIComponent(slug)}`);
          return;
        }
      })
      .catch((err) => {
        setError(err?.message || "Failed to load brands");
        setTenantChoices([]);
      })
      .finally(() => setTenantChoiceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken) return;
    if (!tenantSlug) return;

    if (workspace) {
      setSwitchingCategory(true);
    } else {
      setWorkspaceLoading(true);
    }
    setError("");

    const url = new URL("/api/workspace", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    if (categoryId) url.searchParams.set("categoryId", categoryId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load workspace (${res.status})`);
        return data as WorkspaceData;
      })
      .then((data) => {
        setWorkspace(data);
        setUiActiveCategoryId(null);
        localStorage.setItem("lastTenantSlug", data.tenant.slug);

        if (data.selectedCategoryId && data.selectedCategoryId !== (categoryId ?? "")) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("tenantSlug", data.tenant.slug);
          next.set("categoryId", data.selectedCategoryId);
          router.replace(`/workspace?${next.toString()}`);
        }
      })
      .catch((err) => {
        setWorkspace(null);
        setUiActiveCategoryId(null);
        setError(err?.message || "Failed to load workspace");
      })
      .finally(() => {
        setWorkspaceLoading(false);
        setSwitchingCategory(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, accessToken, tenantSlug, categoryId]);

  async function handleSeed(names: string[]) {
    if (!accessToken || !tenantSlug) return;

    setSeedBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/seed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug, names }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Seed failed (${res.status})`);

      setSeedOpen(false);

      // Force a refetch by reloading the current route
      router.refresh();
      router.replace(`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`);
    } catch (err: any) {
      setError(err?.message || "Seed failed");
    } finally {
      setSeedBusy(false);
    }
  }

  useEffect(() => {
    if (!seedOpen) return;
    if (!accessToken) return;
    if (suggestionsLoading) return;
    if (suggestions.length) return;

    setSuggestionsLoading(true);
    fetch("/api/workspace/suggestions", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load suggestions (${res.status})`);
        return data as { suggestions?: string[] };
      })
      .then((data) => setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [seedOpen, accessToken, suggestionsLoading, suggestions.length]);

  if (authLoading) return <WorkspaceSkeleton />;
  if (user && !session) return <WorkspaceSkeleton />;

  // Only show the full skeleton for first paint / initial checks.
  if (tenantChoiceLoading) return <WorkspaceSkeleton />;
  if (!workspace && workspaceLoading) return <WorkspaceSkeleton />;

  if (showTenantPicker) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="mx-auto max-w-4xl p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Choose a Brand</h1>
              <p className="text-sm text-foreground/70">Select where you want to work.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {tenantChoices.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  localStorage.setItem("lastTenantSlug", t.slug);
                  router.push(`/workspace?tenantSlug=${encodeURIComponent(t.slug)}`);
                }}
                className="rounded-md border border-foreground/20 bg-background p-4 text-left hover:bg-foreground/5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border border-foreground/20">
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt={t.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <span className="font-semibold">{t.name[0]}</span>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-sm text-foreground/70">/{t.slug}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <Link
              href="/onboarding"
              className="inline-flex h-11 items-center justify-center rounded-md border border-foreground/20 px-4"
            >
              Create New Brand
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!tenantSlug) {
    return <WorkspaceSkeleton />;
  }

  if (error && !workspace) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="mx-auto max-w-4xl p-6">
          <h1 className="text-xl font-semibold">Workspace</h1>
          <div className="mt-4 rounded-md border border-foreground/20 bg-foreground/5 p-3 text-sm">
            {error}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="h-10 rounded-md bg-foreground px-4 text-background"
              onClick={() => router.replace(`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`)}
            >
              Retry
            </button>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-md border border-foreground/20 px-4"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) return <WorkspaceSkeleton />;

  const { tenant, categories, selectedCategoryId, templates } = workspace;
  const activeCategoryId = uiActiveCategoryId ?? categoryId ?? selectedCategoryId;

  const hasCategories = categories.length > 0;

  return (
    <div className="min-h-dvh bg-foreground/5">
      <div className="sticky top-0 z-10 border-b border-foreground/10 bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20 bg-background">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logoUrl}
                  alt={`${tenant.name} logo`}
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <span className="text-sm font-semibold">{tenant.name[0]}</span>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-foreground/70" />
                <h1 className="text-base font-semibold">{tenant.name}</h1>
              </div>
              <p className="text-sm text-foreground/70">Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectivityIndicator />

            <div className="relative">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3"
                aria-label="Workspace menu"
                title="Menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-11 z-20 w-56 rounded-md border border-foreground/20 bg-background p-1 shadow-sm"
                    role="menu"
                  >
                    {workspace.isAdmin ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                        onClick={() => {
                          setMenuOpen(false);
                          setSeedOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add categories
                      </button>
                    ) : null}

                    <Link
                      role="menuitem"
                      href={`/${tenant.slug}/settings`}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-foreground/5"
                      onClick={handleLogout}
                    >
                      Log out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {hasCategories ? (
          <div className="mx-auto max-w-4xl px-4 pb-3">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch]">
              {categories.map((c) => {
                const active = c.id === activeCategoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (c.id === activeCategoryId) return;
                      setUiActiveCategoryId(c.id);
                      setSwitchingCategory(true);

                      const next = new URLSearchParams(searchParams.toString());
                      next.set("tenantSlug", tenant.slug);
                      next.set("categoryId", c.id);
                      router.push(`/workspace?${next.toString()}`);
                    }}
                    className={
                      active
                        ? "h-9 shrink-0 rounded-full bg-foreground px-4 text-sm font-medium text-background"
                        : "h-9 shrink-0 rounded-full border border-foreground/20 bg-background px-4 text-sm font-medium"
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-auto max-w-4xl p-4">
        {error ? (
          <div className="mb-4 rounded-md border border-foreground/20 bg-background p-3 text-sm">
            {error}
          </div>
        ) : null}

        {!hasCategories ? (
          <div className="rounded-lg border border-foreground/20 bg-background p-6">
            <h2 className="text-lg font-semibold">Setup Your Workspace</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Add categories to organize your audit forms.
            </p>
            <button
              type="button"
              onClick={() => setSeedOpen(true)}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-foreground px-4 text-background"
            >
              Setup Workspace
            </button>
          </div>
        ) : switchingCategory ? (
          <div className="rounded-lg border border-foreground/20 bg-background p-6">
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading forms...
            </div>
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-foreground/20 bg-background p-6">
            <h2 className="text-lg font-semibold">No forms in this category yet.</h2>
            <p className="mt-1 text-sm text-foreground/70">
              Add a form from the library to get started.
            </p>
            <button
              type="button"
              onClick={() => setAddFormOpen(true)}
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-background"
            >
              <Plus className="h-4 w-4" />
              Add a form
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/${tenant.slug}/audits/new?templateId=${t.id}`}
                className="rounded-lg border border-foreground/20 bg-background p-4 hover:bg-foreground/5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">{t.title}</div>
                    <div className="text-sm text-foreground/70">Run audit</div>
                  </div>
                  <span className="text-sm text-foreground/60">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <WorkspaceSeedModal
        open={seedOpen}
        onClose={() => (seedBusy ? null : setSeedOpen(false))}
        onSubmit={handleSeed}
        busy={seedBusy}
        suggestions={suggestions}
        loadingSuggestions={suggestionsLoading}
      />

      {workspace ? (
        <AddFormOptionsModal
          open={addFormOpen}
          onClose={() => setAddFormOpen(false)}
          categories={workspace.categories}
          defaultCategoryId={workspace.selectedCategoryId}
          onAddFromTemplates={handleAddFromTemplates}
          onCreateCustom={handleCreateCustomForm}
        />
      ) : null}
    </div>
  );
}
