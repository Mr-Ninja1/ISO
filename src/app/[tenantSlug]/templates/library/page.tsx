"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { enqueueBackgroundMutation } from "@/lib/client/backgroundMutationQueue";

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
  role?: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities?: {
    canCreateForms?: boolean;
  };
};

type WorkspaceCacheEnvelope = {
  ts: number;
  data: WorkspaceData;
};

type LibraryCacheEnvelope = {
  ts: number;
  data: LibraryTemplateSummary[];
};

function canImportFromWorkspaceData(data: WorkspaceData | null | undefined) {
  if (!data) return false;
  if (typeof data.capabilities?.canCreateForms === "boolean") return data.capabilities.canCreateForms;
  return data.role === "ADMIN" || data.role === "MANAGER";
}

function workspaceCacheKey(userId: string | null, tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:${categoryId || "all"}`;
}

function readWorkspaceCache(userId: string | null, tenantSlug: string, categoryId: string | null): WorkspaceData | null {
  if (!tenantSlug) return null;
  try {
    const raw = localStorage.getItem(workspaceCacheKey(userId, tenantSlug, categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCacheEnvelope;
    if (!parsed?.data || typeof parsed.ts !== "number") return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function libraryCacheKey(userId: string | null, tenantSlug: string) {
  return `template-library-cache:v2:${userId || "anon"}:${tenantSlug}`;
}

function readLibraryCache(userId: string | null, tenantSlug: string): LibraryTemplateSummary[] {
  if (!tenantSlug) return [];
  try {
    const raw = localStorage.getItem(libraryCacheKey(userId, tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryCacheEnvelope;
    if (!parsed?.data || typeof parsed.ts !== "number" || !Array.isArray(parsed.data)) return [];
    return parsed.data;
  } catch {
    return [];
  }
}

function writeLibraryCache(userId: string | null, tenantSlug: string, data: LibraryTemplateSummary[]) {
  if (!tenantSlug) return;
  try {
    const payload: LibraryCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(libraryCacheKey(userId, tenantSlug), JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function writeWorkspaceNotice(message: string, tone: "default" | "success" | "warning" | "error" = "default") {
  try {
    localStorage.setItem(
      "workspace-notice:v1",
      JSON.stringify({ message, tone, ts: Date.now() })
    );
  } catch {
    // ignore storage failures
  }
}

export default function TemplatesLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ tenantSlug: string }>();

  const tenantSlug = params?.tenantSlug || "";
  const requestedCategoryId = searchParams.get("categoryId");

  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";
  const cacheUserId = user?.id || null;

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [canImportForms, setCanImportForms] = useState(false);

  const [templates, setTemplates] = useState<LibraryTemplateSummary[]>([]);
  const [importingId, setImportingId] = useState<string>("");
  const [online, setOnline] = useState(true);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!tenantSlug) return;

    const cached = readWorkspaceCache(cacheUserId, tenantSlug, requestedCategoryId);
    if (cached) {
      setCategories(cached.categories || []);
      setSelectedCategoryId(cached.selectedCategoryId);
      setCanImportForms(canImportFromWorkspaceData(cached));
      setWorkspaceLoading(false);
      setError("");
      if (!online) return;
    }

    if (!online) {
      if (!cached) {
        setCategories([]);
        setSelectedCategoryId(null);
        setWorkspaceLoading(false);
        setError("Offline mode: categories are unavailable until this brand is opened once online.");
      }
      return;
    }

    if (!accessToken) return;

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
        setCanImportForms(canImportFromWorkspaceData(data));
      })
      .catch((err) => {
        if (!cached) {
          setError(err?.message || "Failed to load categories");
          setCategories([]);
          setSelectedCategoryId(null);
          setCanImportForms(false);
        }
      })
      .finally(() => setWorkspaceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, requestedCategoryId, online, cacheUserId]);

  useEffect(() => {
    if (authLoading || !user) return;

    const cachedTemplates = readLibraryCache(cacheUserId, tenantSlug);
    if (cachedTemplates.length) {
      setTemplates(cachedTemplates);
      setLibraryLoading(false);
      setError("");
      if (!online) return;
    }

    if (!online) {
      if (!cachedTemplates.length) {
        setTemplates([]);
        setLibraryLoading(false);
        setError("Offline mode: template library is unavailable until loaded once online.");
      }
      return;
    }

    if (!accessToken) return;

    setLibraryLoading(true);
    setError("");

    fetch("/api/template-library", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load template library (${res.status})`);
        return data as { templates: LibraryTemplateSummary[] };
      })
      .then((data) => {
        const next = data.templates || [];
        setTemplates(next);
        writeLibraryCache(cacheUserId, tenantSlug, next);
      })
      .catch((err) => {
        if (!cachedTemplates.length) {
          setTemplates([]);
          setError(err?.message || "Failed to load template library");
        }
      })
      .finally(() => setLibraryLoading(false));
  }, [authLoading, user, accessToken, online, tenantSlug, cacheUserId]);

  async function importTemplate(libraryTemplateId: string) {
    if (!accessToken || !tenantSlug) return;
    if (!canImportForms) {
      setError("You do not have permission to import forms.");
      return;
    }

    setImportingId(libraryTemplateId);
    setError("");
    try {
      if (!navigator.onLine) {
        const dedupeKey = `template-import:${tenantSlug}:${libraryTemplateId}:${selectedCategoryId || "uncategorized"}`;
        enqueueBackgroundMutation({
          url: "/api/templates/import",
          method: "POST",
          body: {
            tenantSlug,
            libraryTemplateId,
            categoryId: selectedCategoryId,
          },
          dedupeKey,
        });
        writeWorkspaceNotice("Template import queued offline. It will sync automatically.", "warning");
        setError("Offline: template import queued and will sync automatically.");
        return;
      }

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
      writeWorkspaceNotice("Template imported successfully.", "success");
      router.push(`/workspace?${next.toString()}`);
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const dedupeKey = `template-import:${tenantSlug}:${libraryTemplateId}:${selectedCategoryId || "uncategorized"}`;
        enqueueBackgroundMutation({
          url: "/api/templates/import",
          method: "POST",
          body: {
            tenantSlug,
            libraryTemplateId,
            categoryId: selectedCategoryId,
          },
          dedupeKey,
        });
        writeWorkspaceNotice("Offline: template import queued and will sync automatically.", "warning");
        setError("Offline: template import queued and will sync automatically.");
      } else {
        setError(err?.message || "Import failed");
      }
    } finally {
      setImportingId("");
    }
  }

  const busy = workspaceLoading || libraryLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
              className="flex flex-col gap-3 rounded-md border border-foreground/20 bg-background p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="font-medium">{t.title}</div>
              {canImportForms ? (
                <button
                  type="button"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50 sm:w-auto"
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
              ) : (
                <span className="text-xs text-foreground/60">No import access</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
