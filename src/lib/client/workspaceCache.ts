"use client";

export type WorkspaceTenantSummary = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type WorkspaceCategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

export type WorkspaceTemplateSummary = {
  id: string;
  title: string;
  updatedAt: string;
  categoryId: string | null;
  hasTemperatureInputs?: boolean;
  settings?: Record<string, unknown>;
};

export type WorkspaceData = {
  tenant: WorkspaceTenantSummary;
  categories: WorkspaceCategorySummary[];
  selectedCategoryId: string | null;
  templates: WorkspaceTemplateSummary[];
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

const FORCE_REFETCH_PREFIX = "workspace-force-refetch:v1:";

/** Online trust window — keep short so multi-device creates appear without re-login. */
export const ONLINE_WORKSPACE_CACHE_TTL_MS = 45_000;
/** Offline / category-tab snapshots may stay longer; network revalidate when online. */
export const OFFLINE_WORKSPACE_CACHE_TTL_MS = 30 * 60_000;

export function workspaceCacheKey(userId: string | null, tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:${categoryId || "all"}`;
}

/** Cheap fingerprint for pull-sync / UI equality checks (categories + templates). */
export function workspaceContentFingerprint(data: {
  selectedCategoryId?: string | null;
  categories?: Array<{ id: string; name?: string; sortOrder?: number }>;
  templates?: Array<{ id: string; updatedAt?: string; title?: string; categoryId?: string | null }>;
}): string {
  const cats = (data.categories || [])
    .map((c) => `${c.id}:${c.name ?? ""}:${c.sortOrder ?? 0}`)
    .sort()
    .join(",");
  const templates = (data.templates || [])
    .map((t) => `${t.id}:${t.updatedAt ?? ""}:${t.title ?? ""}:${t.categoryId ?? ""}`)
    .sort()
    .join(",");
  return `${data.selectedCategoryId ?? ""}|${cats}|${templates}`;
}

function forceRefetchKey(tenantSlug: string) {
  return `${FORCE_REFETCH_PREFIX}${tenantSlug}`;
}

/** Survive navigation so /workspace refetches even if it was unmounted during the mutation. */
export function markWorkspaceForceRefetch(tenantSlug: string) {
  if (typeof window === "undefined" || !tenantSlug) return;
  try {
    sessionStorage.setItem(forceRefetchKey(tenantSlug), String(Date.now()));
  } catch {
    // ignore
  }
}

export function consumeWorkspaceForceRefetch(tenantSlug: string): boolean {
  if (typeof window === "undefined" || !tenantSlug) return false;
  try {
    const raw = sessionStorage.getItem(forceRefetchKey(tenantSlug));
    if (!raw) return false;
    sessionStorage.removeItem(forceRefetchKey(tenantSlug));
    return true;
  } catch {
    return false;
  }
}

export function readWorkspaceCache(
  userId: string | null,
  tenantSlug: string,
  categoryId: string | null
): WorkspaceData | null {
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

export function readWorkspaceCacheResolved(
  userId: string | null,
  tenantSlug: string,
  categoryId: string | null
): WorkspaceData | null {
  return readWorkspaceCache(userId, tenantSlug, categoryId) ?? readWorkspaceCache(userId, tenantSlug, null);
}

export function writeWorkspaceCache(
  userId: string | null,
  tenantSlug: string,
  categoryId: string | null,
  data: WorkspaceData,
  options?: { silent?: boolean }
) {
  if (!tenantSlug) return;
  try {
    const payload: WorkspaceCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(workspaceCacheKey(userId, tenantSlug, categoryId), JSON.stringify(payload));
    if (typeof window !== "undefined" && !options?.silent) {
      window.dispatchEvent(
        new CustomEvent("workspace-cache-updated", {
          detail: { tenantSlug, categoryId },
        })
      );
    }
  } catch {
    // ignore quota errors
  }
}

function listTenantCacheKeys(userId: string | null, tenantSlug: string): Array<{ key: string; categoryId: string | null }> {
  const prefix = `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:`;
  const out: Array<{ key: string; categoryId: string | null }> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    out.push({ key, categoryId: suffix === "all" ? null : suffix });
  }
  return out;
}

function readEnvelope(key: string): WorkspaceCacheEnvelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCacheEnvelope;
    if (!parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Upsert a template into every matching workspace cache slot without wiping.
 * - `all` cache always gets the template
 * - category caches only keep templates for that category
 */
export function patchWorkspaceTemplateCaches(
  userId: string | null,
  tenantSlug: string,
  nextTemplate: WorkspaceTemplateSummary,
  options?: { replaceLocalId?: string | null }
) {
  if (!tenantSlug || typeof window === "undefined") return;

  const replaceId = options?.replaceLocalId || null;
  const keys = listTenantCacheKeys(userId, tenantSlug);
  if (!keys.length) {
    // Seed a minimal all-cache so the form appears even before first workspace paint.
    const seed: WorkspaceData = {
      tenant: { id: "", name: tenantSlug, slug: tenantSlug, logoUrl: null },
      categories: [],
      selectedCategoryId: null,
      templates: [nextTemplate],
      isAdmin: false,
    };
    writeWorkspaceCache(userId, tenantSlug, null, seed);
    return;
  }

  for (const { key, categoryId } of keys) {
    const envelope = readEnvelope(key);
    if (!envelope?.data) continue;

    const current = Array.isArray(envelope.data.templates) ? envelope.data.templates : [];
    const withoutOld = current.filter(
      (t) => t.id !== nextTemplate.id && (!replaceId || t.id !== replaceId)
    );

    const slotMatches =
      categoryId == null || categoryId === nextTemplate.categoryId || nextTemplate.categoryId == null;

    const nextTemplates = slotMatches
      ? [nextTemplate, ...withoutOld].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      : withoutOld;

    writeWorkspaceCache(
      userId,
      tenantSlug,
      categoryId,
      {
        ...envelope.data,
        templates: nextTemplates,
      },
      { silent: true }
    );
  }

  window.dispatchEvent(
    new CustomEvent("workspace-cache-updated", {
      detail: { tenantSlug, categoryId: nextTemplate.categoryId },
    })
  );
}

/** Upsert a category into all tenant workspace cache slots without wiping. */
export function patchWorkspaceCategoryCaches(
  userId: string | null,
  tenantSlug: string,
  nextCategory: WorkspaceCategorySummary,
  options?: { remove?: boolean }
) {
  if (!tenantSlug || typeof window === "undefined") return;

  const keys = listTenantCacheKeys(userId, tenantSlug);
  if (!keys.length) {
    const seed: WorkspaceData = {
      tenant: { id: "", name: tenantSlug, slug: tenantSlug, logoUrl: null },
      categories: options?.remove ? [] : [nextCategory],
      selectedCategoryId: null,
      templates: [],
      isAdmin: false,
    };
    writeWorkspaceCache(userId, tenantSlug, null, seed);
    return;
  }

  for (const { categoryId } of keys) {
    const data = readWorkspaceCache(userId, tenantSlug, categoryId);
    if (!data) continue;
    const without = (data.categories || []).filter((c) => c.id !== nextCategory.id);
    const categories = options?.remove
      ? without
      : [...without, nextCategory].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

    writeWorkspaceCache(
      userId,
      tenantSlug,
      categoryId,
      {
        ...data,
        categories,
      },
      { silent: true }
    );
  }

  window.dispatchEvent(
    new CustomEvent("workspace-cache-updated", {
      detail: { tenantSlug, categoryId: null },
    })
  );
}

/** Remove a template from all tenant caches (e.g. after delete). */
export function removeWorkspaceTemplateFromCaches(
  userId: string | null,
  tenantSlug: string,
  templateId: string
) {
  if (!tenantSlug || !templateId || typeof window === "undefined") return;
  for (const { categoryId } of listTenantCacheKeys(userId, tenantSlug)) {
    const data = readWorkspaceCache(userId, tenantSlug, categoryId);
    if (!data) continue;
    const templates = (data.templates || []).filter((t) => t.id !== templateId);
    if (templates.length === (data.templates || []).length) continue;
    writeWorkspaceCache(userId, tenantSlug, categoryId, { ...data, templates }, { silent: true });
  }
  window.dispatchEvent(
    new CustomEvent("workspace-cache-updated", {
      detail: { tenantSlug, categoryId: null },
    })
  );
}
