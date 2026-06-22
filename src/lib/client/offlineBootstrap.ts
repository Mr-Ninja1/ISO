"use client";

import { createClient } from "@/lib/auth";
import { fetchNavCapabilities } from "@/lib/client/navCapabilities";
import { cacheAllTenantTemplates, markTenantTemplateBulkCached } from "@/lib/client/offlineTemplateWarmup";
import { type WorkspaceData, writeWorkspaceCache } from "@/lib/client/workspaceCache";
import { apiUrl } from "@/lib/client/apiBase";
import { isCapacitorNativeApp } from "@/lib/capacitor/runtime";
import { fetchWorkspaceViaSupabase } from "@/lib/data/fetchWorkspaceViaSupabase";

const BOOTSTRAP_KEY_PREFIX = "offline-full-bootstrap:v1:";

export type OfflineBootstrapStage =
  | "workspace"
  | "categories"
  | "schemas"
  | "permissions"
  | "done";

export type OfflineBootstrapProgress = {
  stage: OfflineBootstrapStage;
  label: string;
  /** 0–100 */
  percent: number;
  detail?: string;
};

export type OfflineBootstrapResult = {
  tenantName: string;
  categoryCount: number;
  templateCount: number;
};

function bootstrapStorageKey(userId: string | null, tenantSlug: string) {
  return `${BOOTSTRAP_KEY_PREFIX}${userId || "anon"}:${tenantSlug}`;
}

export function isOfflineBootstrapComplete(userId: string | null, tenantSlug: string) {
  if (!tenantSlug) return false;
  try {
    const raw = localStorage.getItem(bootstrapStorageKey(userId, tenantSlug));
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0;
  } catch {
    return false;
  }
}

export function markOfflineBootstrapComplete(userId: string | null, tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    localStorage.setItem(bootstrapStorageKey(userId, tenantSlug), String(Date.now()));
    localStorage.setItem("offlineModeEnabled", "1");
    localStorage.setItem("offlinePreparedAt", new Date().toISOString());
  } catch {
    // ignore
  }
}

export function clearOfflineBootstrapComplete(userId: string | null, tenantSlug: string) {
  if (!tenantSlug) return;
  try {
    localStorage.removeItem(bootstrapStorageKey(userId, tenantSlug));
  } catch {
    // ignore
  }
}

async function fetchWorkspace(accessToken: string, tenantSlug: string, categoryId: string | null) {
  if (isCapacitorNativeApp()) {
    const supabase = createClient();
    return (await fetchWorkspaceViaSupabase(supabase, tenantSlug, categoryId)) as WorkspaceData;
  }

  const url = new URL(apiUrl("/api/workspace"));
  url.searchParams.set("tenantSlug", tenantSlug);
  if (categoryId) url.searchParams.set("categoryId", categoryId);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error || `Workspace download failed (${res.status})`);
  }
  return json as WorkspaceData;
}

/**
 * First-time download for daily offline use: workspace, categories, all form schemas.
 * Does NOT download the full saved-forms history (too slow for large brands).
 * Optionally prefetches a small batch of recent server drafts for offline resume.
 */
export async function runOfflineBootstrap({
  accessToken,
  tenantSlug,
  userId,
  onProgress,
}: {
  accessToken: string;
  tenantSlug: string;
  userId: string | null;
  onProgress: (progress: OfflineBootstrapProgress) => void;
}): Promise<OfflineBootstrapResult> {
  const report = (stage: OfflineBootstrapStage, label: string, percent: number, detail?: string) => {
    onProgress({ stage, label, percent: Math.min(100, Math.max(0, Math.round(percent))), detail });
  };

  report("workspace", "Downloading workspace…", 8);

  const workspace = await fetchWorkspace(accessToken, tenantSlug, null);
  writeWorkspaceCache(userId, tenantSlug, null, workspace);
  if (workspace.selectedCategoryId) {
    writeWorkspaceCache(userId, tenantSlug, workspace.selectedCategoryId, workspace);
  }

  const categories = workspace.categories || [];
  report("workspace", "Workspace ready", 18, workspace.tenant.name);

  if (categories.length > 0) {
    report("categories", "Downloading categories…", 22);
    let done = 0;
    for (const category of categories) {
      try {
        const scoped = await fetchWorkspace(accessToken, tenantSlug, category.id);
        writeWorkspaceCache(userId, tenantSlug, category.id, scoped);
      } catch {
        // best-effort per category
      }
      done += 1;
      const slice = 22 + (done / categories.length) * 28;
      report("categories", `Downloading categories (${done}/${categories.length})…`, slice, category.name);
    }
  } else {
    report("categories", "No categories to download", 50);
  }

  report("schemas", "Downloading form schemas & checklists…", 52);
  const templateCount = await cacheAllTenantTemplates(accessToken, tenantSlug);
  report("schemas", "Form schemas saved on device", 78, `${templateCount} form${templateCount === 1 ? "" : "s"}`);

  report("permissions", "Finishing setup…", 88);
  try {
    await fetchNavCapabilities(accessToken, tenantSlug);
  } catch {
    // non-blocking
  }

  markTenantTemplateBulkCached(tenantSlug);
  markOfflineBootstrapComplete(userId, tenantSlug);
  report("done", "Ready for offline use", 100);

  return {
    tenantName: workspace.tenant.name,
    categoryCount: categories.length,
    templateCount,
  };
}
