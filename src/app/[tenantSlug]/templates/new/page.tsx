"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { FormBuilder } from "@/components/forms/FormBuilder";
import type { FormSection } from "@/types/forms";

type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
};

type WorkspaceData = {
  categories: CategorySummary[];
  selectedCategoryId: string | null;
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
  const [loadingEditInfo, setLoadingEditInfo] = useState(false);
  const [error, setError] = useState<string>("");

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [title, setTitle] = useState("Custom Form");
  const [sections, setSections] = useState<FormSection[]>([{ type: "fields", title: "Fields", fields: [] }]);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [headerActionsMount, setHeaderActionsMount] = useState<HTMLElement | null>(null);

  const [baseSections, setBaseSections] = useState<FormSection[]>([{ type: "fields", title: "Fields", fields: [] }]);
  const [baseVersion, setBaseVersion] = useState(1);
  const [hasAudits, setHasAudits] = useState(false);
  const [auditCount, setAuditCount] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [builderResetKey, setBuilderResetKey] = useState("create-initial");

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
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!accessToken || !tenantSlug) return;

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
        setError(err?.message || "Failed to load categories");
        setCategories([]);
        setSelectedCategoryId(null);
      })
      .finally(() => setWorkspaceLoading(false));
  }, [authLoading, user, accessToken, tenantSlug, requestedCategoryId]);

  useEffect(() => {
    if (!isEditMode) return;
    if (authLoading || !user) return;
    if (!accessToken || !tenantSlug || !editTemplateId) return;

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
  }, [isEditMode, authLoading, user, accessToken, tenantSlug, editTemplateId]);

  async function handleSave(): Promise<boolean> {
    if (!accessToken || !tenantSlug) return false;

    setSaving(true);
    setError("");

    try {
      const schema = {
        version: 1 as const,
        title,
        sections,
      };

      const endpoint = isEditMode ? "/api/templates/save-changes" : "/api/templates/create";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantSlug,
          templateId: editTemplateId,
          title,
          categoryId: selectedCategoryId,
          schema,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      const next = new URLSearchParams();
      next.set("tenantSlug", tenantSlug);
      if (selectedCategoryId) next.set("categoryId", selectedCategoryId);
      next.set("refresh", "1");
      router.push(`/workspace?${next.toString()}`);
      return true;
    } catch (err: any) {
      setError(err?.message || "Failed to save template");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const disableSave = saving || workspaceLoading || loadingEditInfo || !title.trim();

  return (
    <div className="relative min-h-dvh">
      {headerActionsMount
        ? createPortal(
            <div className="mr-1 flex flex-wrap items-center justify-end gap-1 sm:gap-1.5">
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
    </div>
  );
}
