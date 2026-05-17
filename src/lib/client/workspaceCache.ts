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

export function workspaceCacheKey(userId: string | null, tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v2:${userId || "anon"}:${tenantSlug}:${categoryId || "all"}`;
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
  data: WorkspaceData
) {
  if (!tenantSlug) return;
  try {
    const payload: WorkspaceCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(workspaceCacheKey(userId, tenantSlug, categoryId), JSON.stringify(payload));
    if (typeof window !== "undefined") {
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
