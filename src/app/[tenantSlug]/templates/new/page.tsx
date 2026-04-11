"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { FormBuilder } from "@/components/forms/FormBuilder";
import type { FormSection } from "@/types/forms";
import { writeAuditTemplateCache } from "@/lib/client/auditTemplateCache";
import {
  enqueueTemplateSync,
  flushTemplateSyncQueue,
  getPendingTemplateSyncCount,
} from "@/lib/client/templateSyncQueue";

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type WorkspaceData = {
  categories: CategorySummary[];
  selectedCategoryId: string | null;
  templates?: Array<{
    id: string;
    title: string;
    updatedAt: string;
    categoryId: string | null;
  }>;
  tenant?: {
    slug: string;
    name?: string;
    logoUrl?: string | null;
  };
};

type WorkspaceCacheEnvelope = {
  ts: number;
  data: WorkspaceData;
};

type EditInfoResponse = {
  template: {
    id: string;
    title: string;
    categoryId: string | null;
    schema: { sections?: FormSection[]; fields?: any[]; title?: string; meta?: { templateVersion?: number } };
    version: number;
  };
  lock: {
    hasAudits: boolean;
    auditCount: number;
  };
};

type FlatItem = {
  id: string;
  label: string;
  type: string;
  isActive: boolean;
  location: "field" | "column";
};

function schemaToSections(schema: { sections?: FormSection[]; fields?: any[] }): FormSection[] {
  if (Array.isArray(schema.sections) && schema.sections.length) return schema.sections;
  return [{ type: "fields", title: "Fields", fields: schema.fields ?? [] }];
}

function flattenSections(sections: FormSection[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const section of sections) {
    if (section.type === "fields") {
      for (const f of section.fields) {
        items.push({
          id: `field:${f.id}`,
          label: f.label || "Untitled field",
          type: f.type,
          isActive: f.isActive !== false,
          location: "field",
        });
      }
      continue;
    }
    for (const c of section.columns) {
      items.push({
        id: `column:${c.id}`,
        label: c.label || "Untitled column",
        type: c.type,
        isActive: c.isActive !== false,
        location: "column",
      });
    }
  }
  return items;
}

function buildChangeLog(oldSections: FormSection[], nextSections: FormSection[]) {
  const before = flattenSections(oldSections);
  const after = flattenSections(nextSections);

  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterById = new Map(after.map((i) => [i.id, i]));

  const changes: string[] = [];

  for (const item of after) {
    const prev = beforeById.get(item.id);
    if (!prev) {
      changes.push(`Added ${item.location} '${item.label}' (${item.type}).`);
      continue;
    }

    if (prev.label !== item.label) {
      changes.push(`Renamed ${item.location} '${prev.label}' to '${item.label}'.`);
    }

    if (prev.isActive && !item.isActive) {
      changes.push(`Hid ${item.location} '${item.label}'.`);
    }

    if (!prev.isActive && item.isActive) {
      changes.push(`Re-activated ${item.location} '${item.label}'.`);
    }
  }

  for (const item of before) {
    if (!afterById.has(item.id)) {
      changes.push(`Removed ${item.location} '${item.label}'.`);
    }
  }

  return changes;
}

function workspaceCacheKey(tenantSlug: string, categoryId: string | null) {
  return `workspace-cache:v1:${tenantSlug}:${categoryId || "all"}`;
}

function readWorkspaceCache(tenantSlug: string, categoryId: string | null): WorkspaceData | null {
  if (!tenantSlug) return null;
  try {
    const raw = localStorage.getItem(workspaceCacheKey(tenantSlug, categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceCacheEnvelope;
    if (!parsed?.data || typeof parsed.ts !== "number") return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeWorkspaceCache(tenantSlug: string, categoryId: string | null, data: WorkspaceData) {
  if (!tenantSlug) return;
  try {
    const payload: WorkspaceCacheEnvelope = { ts: Date.now(), data };
    localStorage.setItem(workspaceCacheKey(tenantSlug, categoryId), JSON.stringify(payload));
  } catch {
    // ignore localStorage failures
  }
}

function patchWorkspaceTemplateCaches(
  tenantSlug: string,
  nextTemplate: { id: string; title: string; categoryId: string | null; updatedAt: string }
) {
  if (!tenantSlug) return;

  const prefix = `workspace-cache:v1:${tenantSlug}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(prefix)) keys.push(key);
  }

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const envelope = JSON.parse(raw) as WorkspaceCacheEnvelope;
      if (!envelope?.data) continue;

      const currentTemplates = Array.isArray(envelope.data.templates)
        ? envelope.data.templates
        : [];

      const withoutOld = currentTemplates.filter((t) => t.id !== nextTemplate.id);

      const selected = envelope.data.selectedCategoryId;
      const shouldInclude = selected ? selected === nextTemplate.categoryId : true;
      const nextTemplates = shouldInclude
        ? [nextTemplate, ...withoutOld].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        : withoutOld;

      writeWorkspaceCache(tenantSlug, selected, {
        ...envelope.data,
        templates: nextTemplates,
      });
    } catch {
      // ignore malformed cache items
    }
  }
}

function buildLocalTemplateId() {
  return `local_tmpl_${Math.random().toString(16).slice(2)}_${Date.now()}`;
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

function cacheTemplateSchemaForOffline(
  tenantSlug: string,
  templateId: string,
  title: string,
  sections: FormSection[],
  categoryId: string | null,
  fallbackTenantName: string
) {
  const selectedCache = readWorkspaceCache(tenantSlug, categoryId);
  const allCache = readWorkspaceCache(tenantSlug, null);
  const tenant = selectedCache?.tenant || allCache?.tenant || { slug: tenantSlug, name: fallbackTenantName, logoUrl: null };

  writeAuditTemplateCache(tenantSlug, templateId, {
    tenant: {
      slug: tenant.slug,
      name: tenant.name || fallbackTenantName,
      logoUrl: tenant.logoUrl ?? null,
    },
    template: {
      id: templateId,
      title,
      schema: {
        version: 1,
        title,
        sections,
      },
      updatedAt: new Date().toISOString(),
    },
  });
}

export default function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ tenantSlug: string }>();

  const tenantSlug = params?.tenantSlug || "";
  const requestedCategoryId = searchParams.get("categoryId");
  const editTemplateId = searchParams.get("editTemplateId");
  const isEditMode = Boolean(editTemplateId);

  const { user, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token || "";

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingPhoto, setImportingPhoto] = useState(false);
  const [loadingEditInfo, setLoadingEditInfo] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [title, setTitle] = useState("Custom Form");
  const [sections, setSections] = useState<FormSection[]>([{ type: "fields", title: "Fields", fields: [] }]);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showPhotoImportGuide, setShowPhotoImportGuide] = useState(false);
  const [headerActionsMount, setHeaderActionsMount] = useState<HTMLElement | null>(null);
  const [online, setOnline] = useState(true);

  const [baseSections, setBaseSections] = useState<FormSection[]>([{ type: "fields", title: "Fields", fields: [] }]);
  const [baseVersion, setBaseVersion] = useState(1);
  const [hasAudits, setHasAudits] = useState(false);
  const [auditCount, setAuditCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [builderResetKey, setBuilderResetKey] = useState("create-initial");
  const [queuedTemplateSaves, setQueuedTemplateSaves] = useState(0);
  const [offlineDraftTemplateId, setOfflineDraftTemplateId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const lockedFieldIds = useMemo(() => {
    if (!hasAudits) return [] as string[];
    return flattenSections(baseSections)
      .filter((i) => i.location === "field")
      .map((i) => i.id.replace("field:", ""));
  }, [baseSections, hasAudits]);

  const lockedGridColumnIds = useMemo(() => {
    if (!hasAudits) return [] as string[];
    return flattenSections(baseSections)
      .filter((i) => i.location === "column")
      .map((i) => i.id.replace("column:", ""));
  }, [baseSections, hasAudits]);

  const changeLog = useMemo(() => buildChangeLog(baseSections, sections), [baseSections, sections]);

  const oldVisible = useMemo(
    () => flattenSections(baseSections).filter((i) => i.isActive),
    [baseSections]
  );
  const newVisible = useMemo(
    () => flattenSections(sections).filter((i) => i.isActive),
    [sections]
  );

  useEffect(() => {
    setHeaderActionsMount(document.getElementById("tenant-header-actions"));
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    setQueuedTemplateSaves(getPendingTemplateSyncCount());
  }, []);

  useEffect(() => {
    const updateOnline = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const flush = async () => {
      const result = await flushTemplateSyncQueue(accessToken).catch(() => ({ processed: 0, remaining: getPendingTemplateSyncCount() }));
      setQueuedTemplateSaves(result.remaining);
    };

    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [accessToken]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!tenantSlug) return;

    const cached = readWorkspaceCache(tenantSlug, requestedCategoryId);
    if (cached) {
      setCategories(cached.categories || []);
      setSelectedCategoryId(cached.selectedCategoryId);
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
      })
      .catch((err) => {
        if (!cached) {
          setError(err?.message || "Failed to load categories");
          setCategories([]);
          setSelectedCategoryId(null);
        }
      })
      .finally(() => setWorkspaceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, requestedCategoryId, online]);

  useEffect(() => {
    if (!isEditMode) return;
    if (authLoading || !user) return;
    if (!tenantSlug || !editTemplateId) return;

    if (!online) {
      setLoadingEditInfo(false);
      setError("Offline mode: opening existing form versions for editing requires a prior online load.");
      return;
    }

    if (!accessToken) return;

    setLoadingEditInfo(true);
    setError("");

    const url = new URL("/api/templates/edit-info", window.location.origin);
    url.searchParams.set("tenantSlug", tenantSlug);
    url.searchParams.set("templateId", editTemplateId);

    fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Failed to load template (${res.status})`);
        return data as EditInfoResponse;
      })
      .then((data) => {
        const loadedSections = schemaToSections(data.template.schema);
        setTitle(data.template.title || data.template.schema.title || "Custom Form");
        setSelectedCategoryId(data.template.categoryId ?? null);
        setSections(loadedSections);
        setBaseSections(loadedSections);
        setBaseVersion(data.template.version || 1);
        setHasAudits(data.lock.hasAudits);
        setAuditCount(data.lock.auditCount);
        setBuilderResetKey(`edit-${data.template.id}-${Date.now()}`);
      })
      .catch((err) => setError(err?.message || "Failed to load template"))
      .finally(() => setLoadingEditInfo(false));
  }, [isEditMode, authLoading, user, accessToken, tenantSlug, editTemplateId, online]);

  async function handleSave(): Promise<boolean> {
    if (!tenantSlug) return false;

    setSaving(true);
    setError("");

    try {
      const schema = {
        version: 1 as const,
        title,
        sections,
      };

      const endpoint = isEditMode ? "/api/templates/save-changes" : "/api/templates/create";

      const payload = {
        tenantSlug,
        templateId: editTemplateId,
        title,
        categoryId: selectedCategoryId,
        schema,
      };

      if (!accessToken || !navigator.onLine) {
        const localTemplateId = isEditMode
          ? editTemplateId || ""
          : offlineDraftTemplateId || buildLocalTemplateId();
        if (!isEditMode && !offlineDraftTemplateId && localTemplateId) {
          setOfflineDraftTemplateId(localTemplateId);
        }
        enqueueTemplateSync({
          mode: isEditMode ? "save-changes" : "create",
          payload: {
            ...payload,
            templateId: localTemplateId || payload.templateId,
          },
        });
        setQueuedTemplateSaves(getPendingTemplateSyncCount());
        if (localTemplateId) {
          patchWorkspaceTemplateCaches(tenantSlug, {
            id: localTemplateId,
            title,
            categoryId: selectedCategoryId ?? null,
            updatedAt: new Date().toISOString(),
          });
          cacheTemplateSchemaForOffline(
            tenantSlug,
            localTemplateId,
            title,
            sections,
            selectedCategoryId ?? null,
            "Workspace"
          );
        }
        setError("Saved offline. Your form changes are queued and will sync automatically when online.");
        writeWorkspaceNotice("Form saved offline. It will sync automatically when internet returns.", "warning");
        const next = new URLSearchParams();
        next.set("tenantSlug", tenantSlug);
        if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
        router.push(`/workspace?${next.toString()}`);
        return true;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      const savedTemplateId = (data?.templateId as string | undefined) || editTemplateId || "";
      if (savedTemplateId) {
        patchWorkspaceTemplateCaches(tenantSlug, {
          id: savedTemplateId,
          title,
          categoryId: selectedCategoryId ?? null,
          updatedAt: new Date().toISOString(),
        });
      }

      writeWorkspaceNotice(isEditMode ? "Form changes saved." : "Form created successfully.", "success");
      const next = new URLSearchParams();
      next.set("tenantSlug", tenantSlug);
      if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
      next.set("refresh", "1");
      router.push(`/workspace?${next.toString()}`);
      return true;
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isNetwork = /Failed to fetch|NetworkError|network/i.test(msg) || !navigator.onLine;
      if (isNetwork) {
        const localTemplateId = isEditMode
          ? editTemplateId || ""
          : offlineDraftTemplateId || buildLocalTemplateId();
        if (!isEditMode && !offlineDraftTemplateId && localTemplateId) {
          setOfflineDraftTemplateId(localTemplateId);
        }
        const schema = {
          version: 1 as const,
          title,
          sections,
        };
        enqueueTemplateSync({
          mode: isEditMode ? "save-changes" : "create",
          payload: {
            tenantSlug,
            templateId: localTemplateId || editTemplateId,
            title,
            categoryId: selectedCategoryId,
            schema,
          },
        });
        setQueuedTemplateSaves(getPendingTemplateSyncCount());
        if (localTemplateId) {
          patchWorkspaceTemplateCaches(tenantSlug, {
            id: localTemplateId,
            title,
            categoryId: selectedCategoryId ?? null,
            updatedAt: new Date().toISOString(),
          });
          cacheTemplateSchemaForOffline(
            tenantSlug,
            localTemplateId,
            title,
            sections,
            selectedCategoryId ?? null,
            "Workspace"
          );
        }
        setError("Offline detected. Your form changes were queued and will sync automatically.");
        writeWorkspaceNotice("Offline detected. Form changes were queued and will sync automatically.", "warning");
        const next = new URLSearchParams();
        next.set("tenantSlug", tenantSlug);
        if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
        router.push(`/workspace?${next.toString()}`);
        return true;
      }
      setError(err?.message || "Failed to save template");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function importFromPhoto(file: File) {
    if (!accessToken || !tenantSlug) return;

    setImportingPhoto(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("tenantSlug", tenantSlug);
      formData.set("file", file);

      const res = await fetch("/api/templates/ocr-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `OCR import failed (${res.status})`);

      const importedSections: FormSection[] = Array.isArray(data?.sections)
        ? (data.sections as FormSection[])
        : [{ type: "fields", title: "Fields", fields: [] }];

      setTitle((data?.title as string) || "Imported Form");
      setSections(importedSections);
      setBaseSections(importedSections);
      setBuilderResetKey(`ocr-import-${Date.now()}`);
      setPreviewOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to import from photo");
    } finally {
      setImportingPhoto(false);
    }
  }

  const disableSave = saving || workspaceLoading || loadingEditInfo || !title.trim();

  return (
    <div className="relative min-h-dvh">
      {headerActionsMount
        ? createPortal(
            <div className="mr-1 flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
              {!isEditMode ? (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (!file) return;
                      await importFromPhoto(file);
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-foreground/20 px-2 text-xs sm:h-7"
                    onClick={() => setShowPhotoImportGuide(true)}
                    disabled={importingPhoto || saving || workspaceLoading}
                  >
                    {importingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {importingPhoto ? "Importing..." : "Create from photo"}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-foreground/20 px-2 text-xs sm:h-7"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                {previewOpen ? "Hide panel" : "Show panel"}
              </button>
              <Link
                href={`/workspace?tenantSlug=${encodeURIComponent(tenantSlug)}`}
                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-foreground/20 px-2 text-xs sm:h-7"
              >
                Back
              </Link>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-foreground px-2 text-xs font-medium text-background disabled:opacity-50 sm:h-7"
                onClick={() => setShowSaveConfirm(true)}
                disabled={disableSave}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving
                  </>
                ) : isEditMode ? (
                  "Save changes"
                ) : (
                  "Save"
                )}
              </button>
            </div>,
            headerActionsMount
          )
        : null}

      {error ? (
        <div className="fixed right-6 top-20 z-40 max-w-[calc(100vw-2rem)] rounded-md border border-foreground/20 bg-background/95 px-2 py-1 text-xs shadow-sm">
          {error}
        </div>
      ) : null}

      {queuedTemplateSaves > 0 ? (
        <div className="fixed left-6 right-6 top-20 z-20 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 shadow-sm">
          {queuedTemplateSaves} form change{queuedTemplateSaves === 1 ? "" : "s"} queued for sync. They will upload automatically when connection returns.
        </div>
      ) : null}

      {isEditMode && hasAudits ? (
        <div className="fixed left-6 right-6 top-20 z-30 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-semibold">Compliance Warning</div>
              <div>
                This form has existing submissions ({auditCount}). Changes will be saved as a new version. Existing fields/columns cannot be deleted, but can be hidden.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-visible">
        <div className={"grid grid-cols-1 " + (previewOpen ? "lg:grid-cols-[1fr_320px]" : "") }>
          <div className="min-w-0">
            <FormBuilder
              onChangeSections={setSections}
              initialSections={sections}
              title={title}
              onTitleChange={setTitle}
              lockExistingDeletes={hasAudits}
              lockedFieldIds={lockedFieldIds}
              lockedGridColumnIds={lockedGridColumnIds}
              resetKey={builderResetKey}
            />
          </div>

          {previewOpen ? (
            <aside className="border-l border-foreground/15 bg-background/90 p-3">
              <div className="rounded-md border border-foreground/15 bg-background p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Change log</div>
                <div className="mt-2 space-y-1 text-xs">
                  {changeLog.length ? (
                    changeLog.slice(0, 20).map((entry, idx) => (
                      <div key={`chg-${idx}`} className="rounded border border-foreground/10 bg-foreground/[0.03] px-2 py-1">
                        {entry}
                      </div>
                    ))
                  ) : (
                    <div className="text-foreground/60">No changes yet.</div>
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-md border border-foreground/15 bg-background p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70">Preview</div>
                <div className="mt-2 grid gap-3">
                  <div className="rounded-md border border-foreground/15 p-2">
                    <div className="text-xs font-semibold">Old version (v{baseVersion})</div>
                    <div className="mt-1 text-xs text-foreground/70">{oldVisible.length} active items</div>
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                      {oldVisible.map((item) => (
                        <div key={`old-${item.id}`} className="rounded border border-foreground/10 px-2 py-1">
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-foreground/15 p-2">
                    <div className="text-xs font-semibold">New version ({hasAudits ? `v${baseVersion + 1}` : `v${baseVersion}`})</div>
                    <div className="mt-1 text-xs text-foreground/70">{newVisible.length} active items</div>
                    <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                      {newVisible.map((item) => (
                        <div key={`new-${item.id}`} className="rounded border border-foreground/10 px-2 py-1">
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {showSaveConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg border border-foreground/20 bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold">
              {isEditMode ? "Confirm template update" : "Confirm form details"}
            </div>
            <div className="mt-1 text-xs text-foreground/70">
              {isEditMode
                ? hasAudits
                  ? `This will create version v${baseVersion + 1} and keep v${baseVersion} for historical reports.`
                  : "No submissions found. This will overwrite the current version directly."
                : "Confirm the category and form title before saving."}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Form title</label>
                <input
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Form title"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Category</label>
                <select
                  className="h-9 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm"
                  value={selectedCategoryId ?? ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  disabled={workspaceLoading || saving}
                >
                  <option value="">Uncategorized</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                onClick={() => setShowSaveConfirm(false)}
                disabled={saving}
              >
                Close
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
                onClick={async () => {
                  const ok = await handleSave();
                  if (ok) setShowSaveConfirm(false);
                }}
                disabled={saving || !title.trim()}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : isEditMode ? (
                  "Confirm & save changes"
                ) : (
                  "Confirm & save"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPhotoImportGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-foreground/20 bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold">Create a form from photo</div>
            <div className="mt-2 text-sm text-foreground/80">
              You can generate a form by uploading a clear photo (or PDF) of your physical form.
            </div>

            <div className="mt-3 rounded-md border border-foreground/20 bg-foreground/[0.03] p-3 text-xs text-foreground/80">
              Best results:
              <br />- Capture the full page edge-to-edge in good lighting.
              <br />- Keep text, labels, table headers, and signature lines fully visible.
              <br />- Avoid shadows, blur, skewed angles, and folded paper.
              <br />- Use a blank printed form only. Handwritten marks can reduce OCR accuracy.
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 px-3 text-sm"
                onClick={() => setShowPhotoImportGuide(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background"
                onClick={() => {
                  setShowPhotoImportGuide(false);
                  photoInputRef.current?.click();
                }}
              >
                Choose photo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
