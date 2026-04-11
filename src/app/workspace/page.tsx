"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, LayoutDashboard, Loader2, MoreVertical, Plus, Search, Settings, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AddFormOptionsModal } from "@/components/AddFormOptionsModal";
import { ConnectivityIndicator } from "@/components/ConnectivityIndicator";
import { LoggedInStaffBadge } from "@/components/LoggedInStaffBadge";
import { NotificationModal } from "@/components/NotificationModal";
import { WorkspaceSeedModal } from "@/components/WorkspaceSeedModal";
import {
  readAuditTemplateCache,
  writeAuditTemplateCache,
} from "@/lib/client/auditTemplateCache";

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
  role?: "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER" | "MEMBER";
  capabilities?: {
    canAccessSettings?: boolean;
    canCreateForms?: boolean;
    canManageCategories?: boolean;
    canManageStaff?: boolean;
  };
};

type WorkspaceCacheEnvelope = {
  ts: number;
  data: WorkspaceData;
};

const RECENT_TEMPLATES_LIMIT = 6;

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
    // Strict cache-first: if data exists locally, use it regardless of age.
    return parsed.data;
  } catch {
    return null;
  }
}

function writeWorkspaceCache(userId: string | null, tenantSlug: string, categoryId: string | null, data: WorkspaceData) {
  if (!tenantSlug) return;
  try {
    const payload: WorkspaceCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(workspaceCacheKey(userId, tenantSlug, categoryId), JSON.stringify(payload));
  } catch {
    // ignore quota / serialization failures
  }
}

function recentTemplatesKey(tenantSlug: string) {
  return `recent-templates:v1:${tenantSlug}`;
}

function readRecentTemplateIds(tenantSlug: string): string[] {
  if (!tenantSlug) return [];
  try {
    const raw = localStorage.getItem(recentTemplatesKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeRecentTemplateIds(tenantSlug: string, ids: string[]) {
  if (!tenantSlug) return;
  try {
    localStorage.setItem(recentTemplatesKey(tenantSlug), JSON.stringify(ids.slice(0, RECENT_TEMPLATES_LIMIT)));
  } catch {
    // ignore localStorage failures
  }
}

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

function WorkspacePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading, signOut } = useAuth();

  const tenantSlug = searchParams.get("tenantSlug") || "";
  const categoryId = searchParams.get("categoryId");
  const forceRefresh = searchParams.get("refresh") === "1";

  const accessToken = session?.access_token || "";
  const cacheUserId = user?.id || null;

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
  const [openingTemplateId, setOpeningTemplateId] = useState<string | null>(null);
  const [offlinePreparing, setOfflinePreparing] = useState(false);
  const [offlinePreparedAt, setOfflinePreparedAt] = useState<string | null>(null);
  const [prefetchingSchemas, setPrefetchingSchemas] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [templateQuery, setTemplateQuery] = useState("");
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [revalidateTick, setRevalidateTick] = useState(0);
  const [confirmOfflineOpen, setConfirmOfflineOpen] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; tone?: "default" | "success" | "warning" | "error" } | null>(null);
  const workspaceRetryTimerRef = useRef<number | null>(null);
  const activeCategoryId = uiActiveCategoryId ?? categoryId ?? workspace?.selectedCategoryId ?? null;
  const workspaceLoadKey = `${categoryId ?? ""}|${forceRefresh ? "refresh" : "normal"}`;

  function rememberRecentTemplate(templateId: string) {
    if (!tenantSlug) return;
    const next = [templateId, ...recentTemplateIds.filter((id) => id !== templateId)].slice(
      0,
      RECENT_TEMPLATES_LIMIT
    );
    setRecentTemplateIds(next);
    writeRecentTemplateIds(tenantSlug, next);
  }

  function clearTenantLocalCache() {
    if (!tenantSlug) return;

    const prefixA = `workspace-cache:v2:${cacheUserId || "anon"}:${tenantSlug}:`;
    const prefixB = `audit-template-cache:v1:${tenantSlug}:`;
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(prefixA) || key.startsWith(prefixB) || key === recentTemplatesKey(tenantSlug)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }

    setRecentTemplateIds([]);
    setMenuOpen(false);
    setNotification({
      title: "Cache cleared",
      message: "Local workspace and form caches were removed for this brand.",
      tone: "success",
    });
  }

  async function prefetchTemplateSchema(templateId: string) {
    if (!accessToken || !tenantSlug) return;
    if (readAuditTemplateCache(tenantSlug, templateId)) return;

    const url = new URL("/api/audit/template", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("templateId", templateId);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Template prefetch failed (${res.status})`);

    writeAuditTemplateCache(tenantSlug, templateId, data);
  }

  async function prepareOfflineMode() {
    if (!workspace || !accessToken || !tenantSlug) return;

    setOfflinePreparing(true);
    setError("");

    try {
      const targets: Array<string | null> = [null, ...workspace.categories.map((c) => c.id)];

      for (const cid of targets) {
        const url = new URL("/api/workspace", window.location.origin);
        url.searchParams.set("tenantSlug", tenantSlug);
        if (cid) url.searchParams.set("categoryId", cid);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Offline prep failed (${res.status})`);
        writeWorkspaceCache(cacheUserId, tenantSlug, cid, data as WorkspaceData);
      }

      const templatesUrl = new URL("/api/audit/templates-cache", window.location.origin);
      templatesUrl.searchParams.set("tenantSlug", tenantSlug);
      const templatesRes = await fetch(templatesUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const templatesJson = await templatesRes.json().catch(() => ({}));
      if (!templatesRes.ok) {
        throw new Error(templatesJson?.error || `Template prep failed (${templatesRes.status})`);
      }

      for (const t of templatesJson.templates || []) {
        writeAuditTemplateCache(tenantSlug, t.id, {
          tenant: templatesJson.tenant,
          template: {
            id: t.id,
            title: t.title,
            schema: t.schema,
            updatedAt: t.updatedAt,
          },
        });
      }

      const now = new Date().toISOString();
      localStorage.setItem("offlineModeEnabled", "1");
      localStorage.setItem("offlinePreparedAt", now);
      setOfflinePreparedAt(now);
      setNotification({
        title: "Offline mode prepared",
        message: "Forms and workspace data are cached for faster loading and offline use.",
        tone: "success",
      });
    } catch (err: any) {
      setError(err?.message || "Offline preparation failed");
    } finally {
      setOfflinePreparing(false);
      setMenuOpen(false);
    }
  }

  async function primeOfflineCachesInBackground() {
    if (!workspace || !accessToken || !tenantSlug) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      const targets: Array<string | null> = [null, ...workspace.categories.map((c) => c.id)];

      for (const cid of targets) {
        const url = new URL("/api/workspace", window.location.origin);
        url.searchParams.set("tenantSlug", tenantSlug);
        if (cid) url.searchParams.set("categoryId", cid);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) continue;
        const data = (await res.json().catch(() => null)) as WorkspaceData | null;
        if (!data) continue;
        writeWorkspaceCache(cacheUserId, tenantSlug, cid, data);
      }

      const templatesUrl = new URL("/api/audit/templates-cache", window.location.origin);
      templatesUrl.searchParams.set("tenantSlug", tenantSlug);
      const templatesRes = await fetch(templatesUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (templatesRes.ok) {
        const templatesJson = await templatesRes.json().catch(() => ({}));
        for (const t of templatesJson.templates || []) {
          writeAuditTemplateCache(tenantSlug, t.id, {
            tenant: templatesJson.tenant,
            template: {
              id: t.id,
              title: t.title,
              schema: t.schema,
              updatedAt: t.updatedAt,
            },
          });
        }
      }

      const now = new Date().toISOString();
      localStorage.setItem("offlineModeEnabled", "1");
      localStorage.setItem("offlinePreparedAt", now);
      setOfflinePreparedAt(now);
    } catch {
      // silent background warm-up
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    try {
      setLoggingOut(true);
      setMenuOpen(false);
      await signOut();
    } finally {
      router.push("/login");
      setLoggingOut(false);
    }
  }

  function handleOpenSettings(targetTenantSlug: string) {
    if (openingSettings) return;
    setOpeningSettings(true);
    setMenuOpen(false);
    router.push(`/${targetTenantSlug}/settings`);
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

  const filteredTemplates = useMemo(() => {
    if (!workspace) return [];
    const q = templateQuery.trim().toLowerCase();
    if (!q) return workspace.templates;
    return workspace.templates.filter((t) => t.title.toLowerCase().includes(q));
  }, [workspace, templateQuery]);

  const recentTemplates = useMemo(() => {
    if (!workspace || recentTemplateIds.length === 0) return [];
    const byId = new Map(workspace.templates.map((t) => [t.id, t]));
    return recentTemplateIds
      .map((id) => byId.get(id))
      .filter((t): t is TemplateSummary => Boolean(t));
  }, [workspace, recentTemplateIds]);

  // Hydrate instantly from local cache, independent of auth/network timing.
  useEffect(() => {
    if (!tenantSlug) return;
    const cached = readWorkspaceCache(cacheUserId, tenantSlug, categoryId);
    if (!cached) return;

    setWorkspace(cached);
    setUiActiveCategoryId(null);
    setWorkspaceLoading(false);
    setSwitchingCategory(false);
    setError("");
    localStorage.setItem("lastTenantSlug", cached.tenant.slug);
    // Keep dependency size stable to avoid React dev warning during fast refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, categoryId]);

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

    const cached = readWorkspaceCache(cacheUserId, tenantSlug, categoryId);
    const hasCached = Boolean(cached);
    if (cached) {
      setWorkspace(cached);
      setUiActiveCategoryId(null);
      setWorkspaceLoading(false);
      setSwitchingCategory(false);
      setError("");
      localStorage.setItem("lastTenantSlug", cached.tenant.slug);
    }

    if (workspace && !hasCached) {
      setSwitchingCategory(true);
    } else if (!hasCached) {
      setWorkspaceLoading(true);
    }

    setError("");

    const url = new URL("/api/workspace", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    if (categoryId) url.searchParams.set("categoryId", categoryId);

    let keepLoading = false;

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data?.error || `Failed to load workspace (${res.status})`) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        return data as WorkspaceData;
      })
      .then((data) => {
        const sameTenant =
          workspace?.tenant.slug === data.tenant.slug &&
          workspace?.tenant.name === data.tenant.name &&
          workspace?.tenant.logoUrl === data.tenant.logoUrl;
        const sameCategory = workspace?.selectedCategoryId === data.selectedCategoryId;
        const sameTemplates =
          Array.isArray(workspace?.templates) &&
          workspace.templates.length === data.templates.length &&
          workspace.templates.every((t, idx) => {
            const n = data.templates[idx];
            return (
              n &&
              t.id === n.id &&
              t.updatedAt === n.updatedAt &&
              t.categoryId === n.categoryId &&
              t.title === n.title
            );
          });

        if (!(sameTenant && sameCategory && sameTemplates)) {
          setWorkspace(data);
          setUiActiveCategoryId(null);
        }
        localStorage.setItem("lastTenantSlug", data.tenant.slug);
        writeWorkspaceCache(cacheUserId, tenantSlug, categoryId, data);

        // Also cache under resolved selected category for instant tab switching.
        if (data.selectedCategoryId) {
          writeWorkspaceCache(cacheUserId, tenantSlug, data.selectedCategoryId, data);
        }

        if (data.selectedCategoryId && data.selectedCategoryId !== (categoryId ?? "")) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("tenantSlug", data.tenant.slug);
          next.set("categoryId", data.selectedCategoryId);
          next.delete("refresh");
          router.replace(`/workspace?${next.toString()}`);
        } else if (forceRefresh) {
          const next = new URLSearchParams(searchParams.toString());
          next.delete("refresh");
          router.replace(`/workspace?${next.toString()}`);
        }
      })
      .catch((err) => {
        const busy = err?.status === 503 || /Workspace backend is busy/i.test(String(err?.message || ""));
        if (!hasCached) {
          if (busy) {
            // Keep skeleton visible and retry shortly instead of flashing an error state.
            keepLoading = true;
            setWorkspace(null);
            setUiActiveCategoryId(null);
            setError("");
            if (workspaceRetryTimerRef.current !== null) {
              window.clearTimeout(workspaceRetryTimerRef.current);
            }
            workspaceRetryTimerRef.current = window.setTimeout(() => {
              setRevalidateTick((x) => x + 1);
            }, 1200);
            return;
          }
          setWorkspace(null);
          setUiActiveCategoryId(null);
          setError(err?.message || "Failed to load workspace");
        }
      })
      .finally(() => {
        if (!keepLoading) setWorkspaceLoading(false);
        setSwitchingCategory(false);
      });

    return () => {
      if (workspaceRetryTimerRef.current !== null) {
        window.clearTimeout(workspaceRetryTimerRef.current);
        workspaceRetryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, accessToken, tenantSlug, workspaceLoadKey, revalidateTick, cacheUserId]);

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
    const ts = localStorage.getItem("offlinePreparedAt");
    if (ts) setOfflinePreparedAt(ts);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("workspace-notice:v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        message?: string;
        tone?: "default" | "success" | "warning" | "error";
        ts?: number;
      };
      if (!parsed?.message) return;
      if (typeof parsed.ts === "number" && Date.now() - parsed.ts > 90_000) {
        localStorage.removeItem("workspace-notice:v1");
        return;
      }
      setNotification({
        title: "Workspace update",
        message: parsed.message,
        tone: parsed.tone || "default",
      });
      localStorage.removeItem("workspace-notice:v1");
    } catch {
      localStorage.removeItem("workspace-notice:v1");
    }
  }, []);

  useEffect(() => {
    if (!workspace || !tenantSlug || !accessToken) return;
    if (offlinePreparedAt) return;

    primeOfflineCachesInBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, tenantSlug, accessToken, offlinePreparedAt]);

  useEffect(() => {
    if (!tenantSlug) return;
    setRecentTemplateIds(readRecentTemplateIds(tenantSlug));
  }, [tenantSlug]);

  useEffect(() => {
    if (!workspace || !accessToken || !tenantSlug) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let active = true;
    const key = `template-bulk-warm:v1:${tenantSlug}`;
    const last = Number(localStorage.getItem(key) || "0");
    // Avoid hammering API while still keeping cache fresh enough for snappy opens.
    if (Date.now() - last < 60 * 1000) return;

    (async () => {
      try {
        const templatesUrl = new URL("/api/audit/templates-cache", window.location.origin);
        templatesUrl.searchParams.set("tenantSlug", tenantSlug);
        const templatesRes = await fetch(templatesUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!templatesRes.ok || !active) return;

        const templatesJson = await templatesRes.json().catch(() => ({}));
        for (const t of templatesJson.templates || []) {
          writeAuditTemplateCache(tenantSlug, t.id, {
            tenant: templatesJson.tenant,
            template: {
              id: t.id,
              title: t.title,
              schema: t.schema,
              updatedAt: t.updatedAt,
            },
          });
        }
        localStorage.setItem(key, String(Date.now()));
      } catch {
        // best-effort warm-up
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.tenant.slug, workspace?.templates?.length, accessToken, tenantSlug]);

  useEffect(() => {
    if (!workspace) return;

    const role = workspace.role || (workspace.isAdmin ? "ADMIN" : "MEMBER");
    const canAccessSettings =
      workspace.capabilities?.canAccessSettings ?? (role === "ADMIN" || role === "MANAGER");
    if (!canAccessSettings) return;

    router.prefetch(`/${workspace.tenant.slug}/settings`);
  }, [
    workspace?.tenant.slug,
    workspace?.capabilities?.canAccessSettings,
    workspace?.role,
    workspace?.isAdmin,
    router,
  ]);

  useEffect(() => {
    if (!workspace) return;
    const toPrefetch = workspace.templates.slice(0, 8);
    for (const t of toPrefetch) {
      router.prefetch(`/${workspace.tenant.slug}/audits/new?templateId=${t.id}`);
    }
  }, [workspace?.tenant.slug, workspace?.templates, router]);

  useEffect(() => {
    const onOnline = () => setRevalidateTick((x) => x + 1);
    const onFocus = () => setRevalidateTick((x) => x + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setRevalidateTick((x) => x + 1);
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

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

  useEffect(() => {
    if (!tenantSlug || !workspace) return;

    const total = workspace.templates.length;
    const cachedCount = workspace.templates.reduce((n, t) => {
      return n + (readAuditTemplateCache(tenantSlug, t.id) ? 1 : 0);
    }, 0);

    setPrefetchingSchemas(false);
    setPrefetchProgress({ done: cachedCount, total });
  }, [tenantSlug, workspace]);

  if (authLoading && !workspace) return <WorkspaceSkeleton />;
  if (user && !session && !workspace) return <WorkspaceSkeleton />;

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
  const role = workspace.role || (workspace.isAdmin ? "ADMIN" : "MEMBER");
  const canManageCategories =
    workspace.capabilities?.canManageCategories ?? (role === "ADMIN" || role === "MANAGER");
  const canCreateForms =
    workspace.capabilities?.canCreateForms ?? (role === "ADMIN" || role === "MANAGER");
  const canAccessSettings =
    workspace.capabilities?.canAccessSettings ?? (role === "ADMIN" || role === "MANAGER");

  const hasCategories = categories.length > 0;

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,rgba(23,23,23,0.03)_0%,rgba(23,23,23,0.015)_35%,rgba(23,23,23,0.04)_100%)]">
      <div className="sticky top-0 z-10 border-b border-foreground/10 bg-background/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:gap-4">
          <div className="min-w-0 flex items-center gap-3">
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
            <div className="min-w-0 flex flex-col">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-foreground/70" />
                <h1 className="truncate text-base font-semibold">{tenant.name}</h1>
              </div>
              <p className="hidden text-sm text-foreground/70 sm:block">Workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block">
              <LoggedInStaffBadge tenantSlug={tenant.slug} />
            </div>
            <ConnectivityIndicator />
            {prefetchingSchemas && prefetchProgress.total > 0 ? (
              <span className="hidden rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/70 sm:inline">
                Preloading forms {prefetchProgress.done}/{prefetchProgress.total}
              </span>
            ) : null}
            {offlinePreparedAt ? (
              <span className="hidden rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/70 sm:inline">
                Offline ready
              </span>
            ) : null}
            {openingSettings ? (
              <span className="hidden items-center gap-1 rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/70 sm:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Opening settings...
              </span>
            ) : null}
            {loggingOut ? (
              <span className="hidden items-center gap-1 rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/70 sm:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Signing out...
              </span>
            ) : null}

            <div className="relative">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3"
                aria-label="Workspace menu"
                title="Menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={openingSettings || loggingOut}
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
                    {canManageCategories ? (
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

                    {canCreateForms ? (
                      <>
                        <Link
                          role="menuitem"
                          href={`/${tenant.slug}/templates/new${workspace.selectedCategoryId ? `?categoryId=${encodeURIComponent(workspace.selectedCategoryId)}` : ""}`}
                          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-foreground/5"
                          onClick={() => setMenuOpen(false)}
                        >
                          <Plus className="h-4 w-4" />
                          Create custom form
                        </Link>

                      </>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                      onClick={() => setConfirmOfflineOpen(true)}
                      disabled={offlinePreparing}
                    >
                      {offlinePreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {offlinePreparing ? "Preparing offline mode..." : "Prepare offline mode"}
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5"
                      onClick={clearTenantLocalCache}
                    >
                      Clear local cache
                    </button>

                    {canAccessSettings ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenSettings(tenant.slug)}
                        disabled={openingSettings || loggingOut}
                      >
                        {openingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                        {openingSettings ? "Opening settings..." : "Settings"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleLogout}
                      disabled={openingSettings || loggingOut}
                    >
                      {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {loggingOut ? "Signing out..." : "Log out"}
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
                      const cachedCategoryData = readWorkspaceCache(cacheUserId, tenant.slug, c.id);
                      if (cachedCategoryData) {
                        setWorkspace(cachedCategoryData);
                        setUiActiveCategoryId(null);
                        setSwitchingCategory(false);
                      } else {
                        setUiActiveCategoryId(c.id);
                        setSwitchingCategory(true);
                      }

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

      <div className="mx-auto max-w-4xl px-4 pt-3">
        <div className="h-px bg-foreground/10" />
      </div>

      <div className="mx-auto max-w-4xl p-4 pb-8">
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
            <div className="rounded-lg border border-foreground/20 bg-background p-3 sm:p-4">
              <div className="relative flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                  aria-expanded={searchOpen}
                  aria-label="Toggle form search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </button>

                {recentTemplates.length > 0 ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRecentOpen((v) => !v)}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-foreground/20 px-3 text-sm hover:bg-foreground/5"
                      aria-expanded={recentOpen}
                      aria-label="Toggle recent forms"
                    >
                      <Clock3 className="h-4 w-4" />
                      Recent forms
                    </button>

                    {recentOpen ? (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-10 cursor-default"
                          aria-label="Close recent forms"
                          onClick={() => setRecentOpen(false)}
                        />
                        <div className="absolute right-0 top-11 z-20 w-72 rounded-md border border-foreground/20 bg-background p-2 shadow-sm">
                          <div className="mb-1 px-2 py-1 text-xs font-medium text-foreground/70">
                            Recent forms
                          </div>
                          <div className="flex max-h-60 flex-col overflow-auto">
                            {recentTemplates.map((t) => (
                              <button
                                key={`recent-dropdown-${t.id}`}
                                type="button"
                                onMouseEnter={() => {
                                  prefetchTemplateSchema(t.id).catch(() => {
                                    // best-effort prefetch
                                  });
                                  router.prefetch(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                                }}
                                onFocus={() => {
                                  prefetchTemplateSchema(t.id).catch(() => {
                                    // best-effort prefetch
                                  });
                                  router.prefetch(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                                }}
                                onClick={() => {
                                  setRecentOpen(false);
                                  setOpeningTemplateId(t.id);
                                  rememberRecentTemplate(t.id);
                                  prefetchTemplateSchema(t.id).catch(() => {
                                    // keep navigation moving even if prefetch fails
                                  });
                                  router.push(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                                }}
                                className="rounded-md px-2 py-2 text-left text-sm hover:bg-foreground/5"
                              >
                                {t.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {searchOpen ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="template-search"
                    type="search"
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Search by form title"
                    className="h-10 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm outline-none ring-0 placeholder:text-foreground/40 focus:border-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateQuery("");
                      setSearchOpen(false);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-foreground/20 hover:bg-foreground/5"
                    aria-label="Close search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            {filteredTemplates.length === 0 ? (
              <div className="rounded-lg border border-foreground/20 bg-background p-6">
                <h2 className="text-base font-semibold">No matching forms</h2>
                <p className="mt-1 text-sm text-foreground/70">Try a different search term.</p>
              </div>
            ) : (
              filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => {
                    prefetchTemplateSchema(t.id).catch(() => {
                      // best-effort prefetch
                    });
                    router.prefetch(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                  }}
                  onFocus={() => {
                    prefetchTemplateSchema(t.id).catch(() => {
                      // best-effort prefetch
                    });
                    router.prefetch(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                  }}
                  onClick={() => {
                    setOpeningTemplateId(t.id);
                    rememberRecentTemplate(t.id);
                    prefetchTemplateSchema(t.id).catch(() => {
                      // keep navigation moving even if prefetch fails
                    });
                    router.push(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setOpeningTemplateId(t.id);
                    rememberRecentTemplate(t.id);
                    prefetchTemplateSchema(t.id).catch(() => {
                      // keep navigation moving even if prefetch fails
                    });
                    router.push(`/${tenant.slug}/audits/new?templateId=${t.id}`);
                  }}
                  className={
                    "w-full rounded-lg border border-foreground/20 bg-background p-4 text-left hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-foreground/30 " +
                    (openingTemplateId === t.id ? "opacity-80" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{t.title}</div>
                      <div className="text-sm text-foreground/70">
                        {openingTemplateId === t.id ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Opening form...
                          </span>
                        ) : (
                          "Run audit"
                        )}
                      </div>
                    </div>
                    {openingTemplateId === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-foreground/60" />
                    ) : (
                      <span className="text-sm text-foreground/60">→</span>
                    )}
                  </div>
                </div>
              ))
            )}
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

      <NotificationModal
        open={confirmOfflineOpen}
        title="Enable offline mode?"
        message="This will cache forms and category data for faster loading and reliable use on weak internet."
        tone="warning"
        actionLabel="Enable"
        onAction={async () => {
          setConfirmOfflineOpen(false);
          await prepareOfflineMode();
        }}
        onClose={() => setConfirmOfflineOpen(false)}
      />

      <NotificationModal
        open={Boolean(notification)}
        title={notification?.title || ""}
        message={notification?.message || ""}
        tone={notification?.tone || "default"}
        onClose={() => setNotification(null)}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <WorkspacePageInner />
    </Suspense>
  );
}
